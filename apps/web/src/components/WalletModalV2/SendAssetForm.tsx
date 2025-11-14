import { ChainId, getChainName } from '@pancakeswap/chains'
import { useDebounce } from '@pancakeswap/hooks'
import { useTranslation } from '@pancakeswap/localization'
import { erc20Abi, Percent } from '@pancakeswap/sdk'
import { WrappedTokenInfo } from '@pancakeswap/token-lists'
import {
  AutoRenewIcon,
  BalanceInput,
  Box,
  Button,
  CloseIcon,
  FlexGap,
  IconButton,
  Input,
  LazyAnimatePresence,
  Text,
  domAnimation,
  useToast,
} from '@pancakeswap/uikit'

import tryParseAmount from '@pancakeswap/utils/tryParseAmount'
import { SwapUIV2 } from '@pancakeswap/widgets-internal'
import CurrencyLogo from 'components/Logo/CurrencyLogo'
import { ToastDescriptionWithTx } from 'components/Toast'
import { ASSET_CDN } from 'config/constants/endpoints'
import { BalanceData } from 'hooks/useAddressBalance'
import useCatchTxError from 'hooks/useCatchTxError'
import { useERC20 } from 'hooks/useContract'
import { useCurrencyUsdPrice } from 'hooks/useCurrencyUsdPrice'
import useNativeCurrency from 'hooks/useNativeCurrency'
import { useGetENSAddressByName } from 'hooks/useGetENSAddressByName'
import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'
import { logGTMGiftPreviewEvent } from 'utils/customGTMEventTracking'
import { maxAmountSpend } from 'utils/maxAmountSpend'
import { checksumAddress, formatUnits, isAddress, zeroAddress, encodeFunctionData } from 'viem'
import { CreateGiftView } from 'views/Gift/components/CreateGiftView'
import { SendGiftToggle } from 'views/Gift/components/SendGiftToggle'
import { CHAINS_WITH_GIFT_CLAIM } from 'views/Gift/constants'
import { SendGiftContext, useSendGiftContext } from 'views/Gift/providers/SendGiftProvider'
import { useUserInsufficientBalanceLight } from 'views/SwapSimplify/hooks/useUserInsufficientBalance'
import { useAccount, usePublicClient, useSendTransaction } from 'wagmi'
import { ActionButton } from './ActionButton'
import SendTransactionFlow from './SendTransactionFlow'
import { ViewState } from './type'
import { CopyAddress } from './WalletCopyButton'

const FormContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const AssetContainer = styled(Box)`
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
`

const ChainIconWrapper = styled(Box)`
  position: absolute;
  bottom: -4px;
  right: -4px;
  background: ${({ theme }) => theme.colors.backgroundAlt};
  border: 2px solid ${({ theme }) => theme.colors.backgroundAlt};
  border-radius: 50%;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
`

const AddressInputWrapper = styled(Box)`
  margin-bottom: 8px;
`

const ClearButton = styled(IconButton)`
  color: ${({ theme }) => theme.colors.textSubtle};
`

const ErrorMessage = styled(Text)`
  color: ${({ theme }) => theme.colors.failure};
  font-size: 14px;
`

interface SendAssetFormProps {
  asset: BalanceData
  onViewStateChange: (viewState: ViewState) => void
  viewState: ViewState
}

export const SendAssetForm: React.FC<SendAssetFormProps> = ({ asset, onViewStateChange, viewState }) => {
  const { isSendGift } = useContext(SendGiftContext)
  const isGiftSupported = useMemo(() => CHAINS_WITH_GIFT_CLAIM.includes(asset.chainId), [asset.chainId])
  const isSendGiftSupported = isSendGift && isGiftSupported

  const { t } = useTranslation()
  const [address, setAddress] = useState<string | null>(null)
  const debouncedAddress = useDebounce(address, 500)
  const [amount, setAmount] = useState('')
  const [addressError, setAddressError] = useState('')
  const [estimatedFee, setEstimatedFee] = useState<string | null>(null)
  const [estimatedFeeUsd, setEstimatedFeeUsd] = useState<string | null>(null)
  const [isInputFocus, setIsInputFocus] = useState(false)

  const [txHash, setTxHash] = useState<string | undefined>(undefined)
  const { address: accountAddress } = useAccount()
  const publicClient = usePublicClient({ chainId: asset.chainId })
  const { toastSuccess } = useToast()
  const { fetchWithCatchTxError, loading: attemptingTxn } = useCatchTxError()
  const { includeStarterGas, nativeAmount, isUserInsufficientBalance } = useSendGiftContext()

  // Get resolved ENS address
  const resolvedEnsAddress = useGetENSAddressByName(debouncedAddress || undefined)

  // Get native currency for fee calculation
  const nativeCurrency = useNativeCurrency(asset.chainId)
  const { data: nativeCurrencyPrice } = useCurrencyUsdPrice(nativeCurrency)
  const currency = useMemo(
    () =>
      asset.token.address === zeroAddress
        ? nativeCurrency
        : new WrappedTokenInfo({
            name: asset.token.name,
            symbol: asset.token.symbol,
            decimals: asset.token.decimals,
            address: checksumAddress(asset.token.address as `0x${string}`),
            chainId: asset.chainId,
            logoURI: asset.token.logoURI,
          }),
    [asset, nativeCurrency],
  )

  const tokenBalance = tryParseAmount(asset.quantity, currency)

  const maxAmountInput = useMemo(() => maxAmountSpend(tokenBalance), [tokenBalance])
  const isNativeToken = asset.token.address === zeroAddress
  const erc20Contract = useERC20(asset.token.address as `0x${string}`, { chainId: asset.chainId })
  const { sendTransactionAsync } = useSendTransaction()

  const estimateTransactionFee = useCallback(async () => {
    const effectiveAddress = resolvedEnsAddress || address
    if (!effectiveAddress || !amount || !publicClient || !accountAddress) return

    try {
      let gasEstimate: bigint = 0n

      if (isNativeToken) {
        // For native token, estimate gas for a simple transfer
        gasEstimate = await publicClient.estimateGas({
          account: accountAddress,
          to: effectiveAddress as `0x${string}`,
          value: tryParseAmount(amount, currency)?.quotient ?? 0n,
        })
      } else {
        // For ERC20 tokens, estimate gas for transfer call

        const transferData = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'transfer',
          args: [effectiveAddress as `0x${string}`, tryParseAmount(amount, currency)?.quotient ?? 0n],
        })
        gasEstimate = await publicClient.estimateGas({
          account: accountAddress,
          to: asset.token.address as `0x${string}`,
          data: transferData as `0x${string}`,
        })
      }

      const gasPrice = await publicClient.getGasPrice()

      // Calculate fee in wei
      const fee = gasEstimate * gasPrice
      const formattedFee = formatUnits(fee, nativeCurrency.decimals)
      setEstimatedFee(formattedFee)

      // Calculate USD value if price is available
      if (nativeCurrencyPrice) {
        const feeUsd = (parseFloat(formattedFee) * parseFloat(nativeCurrencyPrice.toFixed())).toFixed(2)
        setEstimatedFeeUsd(feeUsd)
      } else {
        setEstimatedFeeUsd(null)
      }
    } catch (error) {
      console.error('Fee estimation failed:', error)
      setEstimatedFee(null)
      setEstimatedFeeUsd(null)
    }
  }, [
    resolvedEnsAddress,
    address,
    amount,
    publicClient,
    accountAddress,
    isNativeToken,
    erc20Contract,
    currency,
    asset.token.address,
    nativeCurrency.decimals,
    nativeCurrencyPrice,
  ])

  const sendAsset = useCallback(async () => {
    const effectiveAddress = resolvedEnsAddress || address
    if (!effectiveAddress || !amount) return

    const amounts = tryParseAmount(amount, currency)
    try {
      const receipt = await fetchWithCatchTxError(() => {
        if (isNativeToken) {
          return sendTransactionAsync({
            to: effectiveAddress as `0x${string}`,
            value: amounts?.quotient ? BigInt(amounts.quotient.toString()) : 0n,
            chainId: asset.chainId,
          })
        }
        const transferData = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'transfer',
          args: [effectiveAddress as `0x${string}`, tryParseAmount(amount, currency)?.quotient ?? 0n],
        })
        return sendTransactionAsync({
          to: address as `0x${string}`,
          value: amounts?.quotient ?? 0n,
          chainId: asset.chainId,
          data: transferData,
        })
      })

      if (receipt?.status) {
        setTxHash(receipt.transactionHash)
        toastSuccess(
          t('Transaction Submitted'),
          <ToastDescriptionWithTx txHash={receipt.transactionHash}>
            {t('Sent')} {amount} {currency.symbol} {t('to')} {effectiveAddress}
          </ToastDescriptionWithTx>,
        )
        // Reset form after successful transaction
        setAmount('')
        setAddress('')
      }
    } catch (error) {
      console.error('Send failed:', error)
    }
  }, [
    resolvedEnsAddress,
    address,
    amount,
    currency,
    fetchWithCatchTxError,
    isNativeToken,
    sendTransactionAsync,
    asset.chainId,
    asset.token.address,
    accountAddress,
    publicClient?.chain,
    erc20Contract,
    setTxHash,
    toastSuccess,
    t,
  ])

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target
    setAddress(value)
  }

  // Use debounced address for validation to avoid checking on every keystroke
  useEffect(() => {
    const effectiveAddress = resolvedEnsAddress || debouncedAddress
    if (debouncedAddress && !resolvedEnsAddress && !isAddress(debouncedAddress)) {
      setAddressError(t('Invalid wallet address'))
    } else {
      setAddressError('')
    }
  }, [debouncedAddress, resolvedEnsAddress, t])

  const handleClearAddress = () => {
    setAddress('')
    setAddressError('')
  }

  const handleAmountChange = useCallback((value: string) => {
    setAmount(value)
  }, [])

  const handleUserInputBlur = useCallback(() => {
    setTimeout(() => setIsInputFocus(false), 300)
  }, [])

  const handlePercentInput = useCallback(
    (percent: number) => {
      if (maxAmountInput) {
        handleAmountChange(maxAmountInput.multiply(new Percent(percent, 100)).toExact())
      }
    },
    [maxAmountInput, handleAmountChange],
  )

  const handleMaxInput = useCallback(() => {
    handlePercentInput(100)
  }, [handlePercentInput])

  const isInsufficientBalance = useUserInsufficientBalanceLight(currency, tokenBalance, amount)

  const chainName = asset.chainId === ChainId.BSC ? 'BNB' : getChainName(asset.chainId)
  const price = asset.price?.usd ?? 0
  const tokenAmount = tryParseAmount(amount, currency)

  // if gift, tokenAmount must be greater than $1
  const isGiftTokenAmountValid = useMemo(() => {
    if (isSendGiftSupported && amount && !isInsufficientBalance) {
      const valueInUsd = parseFloat(amount) * price
      // NOTE: user can only send gift with amount greater than $1
      const LIMIT_AMOUNT_USD = 1

      // if value is 0, user is not inputting any amount, so make it valid
      // avoid showing error message when user is not inputting any amount
      return valueInUsd === 0 || valueInUsd >= LIMIT_AMOUNT_USD
    }

    return true
  }, [isSendGiftSupported, amount, isInsufficientBalance, price])

  // Effect to estimate fee when address and amount are valid
  useEffect(() => {
    const effectiveAddress = resolvedEnsAddress || address
    if (effectiveAddress && amount && !addressError) {
      estimateTransactionFee()
    } else {
      setEstimatedFee(null)
    }
  }, [resolvedEnsAddress, address, amount, addressError, estimateTransactionFee])

  const isValidAddress = useMemo(() => {
    const effectiveAddress = resolvedEnsAddress || address
    // send gift doesn't need to check address
    return isSendGiftSupported ? true : effectiveAddress && !addressError
  }, [resolvedEnsAddress, address, addressError, isSendGiftSupported])

  if (viewState === ViewState.CONFIRM_TRANSACTION && isSendGiftSupported) {
    return <CreateGiftView key={viewState} tokenAmount={tokenAmount} />
  }

  if (viewState >= ViewState.CONFIRM_TRANSACTION) {
    const effectiveAddress = resolvedEnsAddress || address
    return (
      <SendTransactionFlow
        asset={asset}
        amount={amount}
        recipient={effectiveAddress as string}
        onDismiss={() => {
          onViewStateChange(ViewState.SEND_ASSETS)
          setTxHash(undefined)
        }}
        attemptingTxn={attemptingTxn}
        txHash={txHash}
        chainId={asset.chainId}
        estimatedFee={estimatedFee}
        estimatedFeeUsd={estimatedFeeUsd}
        onConfirm={async () => {
          // Submit the transaction using the improved error handling
          const receipt = await sendAsset()
          if (receipt?.status) {
            onViewStateChange(ViewState.SEND_ASSETS)
          }
        }}
      />
    )
  }

  const isValidGasSponsor =
    includeStarterGas && isSendGiftSupported ? nativeAmount?.greaterThan(0) && !isUserInsufficientBalance : true

  return (
    <FormContainer>
      <SendGiftToggle isNativeToken={isNativeToken} tokenChainId={asset.chainId}>
        {(isSendGiftOn) => (
          <>
            {isSendGiftOn ? null : (
              <Box>
                <AddressInputWrapper>
                  <Box position="relative">
                    <Input
                      value={address ?? ''}
                      onChange={handleAddressChange}
                      placeholder="Recipient address or ENS name"
                      style={{ height: '64px' }}
                      isError={Boolean(addressError)}
                    />
                    {address && (
                      <ClearButton
                        scale="sm"
                        onClick={handleClearAddress}
                        style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)' }}
                        variant="tertiary"
                      >
                        <CloseIcon color="textSubtle" />
                      </ClearButton>
                    )}
                  </Box>
                </AddressInputWrapper>
                {addressError && <ErrorMessage>{addressError}</ErrorMessage>}
                {resolvedEnsAddress && address && (
                  <CopyAddress account={resolvedEnsAddress} tooltipMessage={resolvedEnsAddress} enableDomainName />
                )}
              </Box>
            )}

            <Box>
              <FlexGap alignItems="center" gap="8px" justifyContent="space-between" position="relative">
                <FlexGap alignItems="center" gap="8px" mb="8px">
                  <AssetContainer>
                    <CurrencyLogo currency={currency} size="40px" src={asset.token.logoURI} />
                    <ChainIconWrapper>
                      <img
                        src={`${ASSET_CDN}/web/chains/${asset.chainId}.png`}
                        alt={`${chainName}-logo`}
                        width="12px"
                        height="12px"
                      />
                    </ChainIconWrapper>
                  </AssetContainer>
                  <FlexGap flexDirection="column">
                    <Text fontWeight="bold" fontSize="20px">
                      {asset.token.symbol}
                    </Text>
                    <Text color="textSubtle" fontSize="12px" mt="-4px">{`${chainName.toUpperCase()} ${t(
                      'Chain',
                    )}`}</Text>
                  </FlexGap>
                </FlexGap>
                <Box position="relative">
                  <LazyAnimatePresence mode="wait" features={domAnimation}>
                    {tokenBalance ? (
                      !isInputFocus ? (
                        <SwapUIV2.WalletAssetDisplay
                          isUserInsufficientBalance={isInsufficientBalance}
                          balance={tokenBalance.toSignificant(6)}
                          onMax={handleMaxInput}
                        />
                      ) : (
                        <SwapUIV2.AssetSettingButtonList onPercentInput={handlePercentInput} />
                      )
                    ) : null}
                  </LazyAnimatePresence>
                </Box>
              </FlexGap>

              <BalanceInput
                value={amount}
                onUserInput={handleAmountChange}
                onFocus={() => setIsInputFocus(true)}
                onBlur={handleUserInputBlur}
                currencyValue={amount ? `~${(parseFloat(amount) * price).toFixed(2)} USD` : ''}
                placeholder="0.0"
                unit={asset.token.symbol}
              />
              {isInsufficientBalance && amount && (
                <Text color="failure" fontSize="14px" mt="8px">
                  {t('Insufficient balance')}
                </Text>
              )}

              {!isGiftTokenAmountValid && (
                <Text color="failure" fontSize="14px" mt="8px">
                  {t('Gift amount must be greater than $1')}
                </Text>
              )}
            </Box>
          </>
        )}
      </SendGiftToggle>

      <FlexGap gap="16px" mt="16px">
        <ActionButton onClick={() => onViewStateChange(ViewState.SEND_ASSETS)} variant="tertiary">
          {t('Close')}
        </ActionButton>
        <Button
          id="send-gift-confirm-button"
          width="100%"
          onClick={() => {
            if (isSendGiftSupported) {
              logGTMGiftPreviewEvent(asset.chainId)
            }
            onViewStateChange(ViewState.CONFIRM_TRANSACTION)
          }}
          disabled={
            !isValidAddress ||
            !amount ||
            parseFloat(amount) === 0 ||
            isInsufficientBalance ||
            attemptingTxn ||
            !isValidGasSponsor ||
            !isGiftTokenAmountValid
          }
          isLoading={attemptingTxn}
          endIcon={attemptingTxn ? <AutoRenewIcon spin color="currentColor" /> : undefined}
        >
          {attemptingTxn ? t('Confirming') : t('Next')}
        </Button>
      </FlexGap>
    </FormContainer>
  )
}
