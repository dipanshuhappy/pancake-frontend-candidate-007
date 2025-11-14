import { ChainId, getChainName } from '@pancakeswap/chains'
import { useTranslation } from '@pancakeswap/localization'
import { Currency, Token } from '@pancakeswap/sdk'
import {
  AutoColumn,
  Box,
  Button,
  CheckmarkCircleIcon,
  ColumnCenter,
  Flex,
  FlexGap,
  Link,
  Spinner,
  Text,
} from '@pancakeswap/uikit'
import tryParseAmount from '@pancakeswap/utils/tryParseAmount'
import { ConfirmationPendingContent } from '@pancakeswap/widgets-internal'
import { ChainLogo } from 'components/Logo/ChainLogo'
import { TokenAmountSection } from 'components/TokenAmountSection'
import { useActiveChainId } from 'hooks/useActiveChainId'
import { BalanceData } from 'hooks/useAddressBalance'
import useNativeCurrency from 'hooks/useNativeCurrency'
import { useSwitchNetwork } from 'hooks/useSwitchNetwork'
import { useCallback, useMemo } from 'react'
import { styled } from 'styled-components'
import { getBlockExploreLink, getBlockExploreName } from 'utils'
import { CopyAddress } from './WalletCopyButton'

const Wrapper = styled.div`
  width: 100%;
`
const Section = styled(AutoColumn)`
  padding: 0px;
`

const ConfirmedIcon = styled(ColumnCenter)`
  padding: 24px 0;
`

interface SendTransactionModalProps {
  asset: BalanceData
  amount: string
  recipient: string
  onDismiss?: () => void
  onBack?: () => void
  txHash?: string
  attemptingTxn: boolean
  pendingText?: string
  errorMessage?: string
  onConfirm: () => void
  currency?: Currency
  chainId?: ChainId
  estimatedFee?: string | null
  estimatedFeeUsd?: string | null
}

// Confirm Transaction Screen
export function ConfirmTransactionContent({
  asset,
  amount,
  recipient,
  onConfirm,
  estimatedFee,
  estimatedFeeUsd,
}: {
  asset: BalanceData
  amount: string
  recipient: string
  onConfirm: () => void
  estimatedFee?: string | null
  estimatedFeeUsd?: string | null
  onBack?: () => void
}) {
  const { t } = useTranslation()

  const chainName = (asset.chainId === ChainId.BSC ? 'BNB' : getChainName(asset.chainId)).toUpperCase()
  const { chainId } = useActiveChainId()
  const isChainMatched = chainId === asset.chainId
  const nativeCurrency = useNativeCurrency(asset.chainId)
  const { switchNetworkAsync } = useSwitchNetwork()

  const tokenAmount = useMemo(() => {
    const currency = new Token(
      asset.chainId,
      asset.token.address as `0x${string}`,
      asset.token.decimals,
      asset.token.symbol,
      asset.token.name,
    )

    return tryParseAmount(amount, currency)
  }, [amount, asset])

  return (
    <Wrapper>
      <Section>
        <ColumnCenter>
          <FlexGap width="100%" alignItems="center" position="relative" mb="16px" gap="8px" flexDirection="column">
            <Box width="100%" style={{ textAlign: 'center' }}>
              <Text fontSize="20px" bold>
                {t('Confirm transaction')}
              </Text>
            </Box>
          </FlexGap>

          <TokenAmountSection tokenAmount={tokenAmount} />

          <Flex justifyContent="space-between" width="100%" mb="8px" alignItems="flex-start">
            <Text color="textSubtle">{t('To')}</Text>
            <Box maxWidth="70%" style={{ wordBreak: 'break-all', textAlign: 'right' }}>
              <Text>{recipient}</Text>
            </Box>
          </Flex>
          <Flex justifyContent="flex-end" width="100%" mb="8px" alignItems="flex-end">
            <CopyAddress account={recipient} tooltipMessage={recipient} enableDomainName />
          </Flex>

          <Flex justifyContent="space-between" width="100%" mb="8px" alignItems="center">
            <Text color="textSubtle">{t('Network')}</Text>
            <FlexGap alignItems="center" gap="3px">
              <Text ml="4px">
                {chainName} {t('Chain')}
              </Text>
              <ChainLogo chainId={asset.chainId} width={20} height={20} />
            </FlexGap>
          </Flex>

          <Flex justifyContent="space-between" width="100%" mb="24px">
            <Text color="textSubtle">{t('Network Fee')}</Text>
            <Box style={{ textAlign: 'right' }}>
              <Text>{estimatedFee ? `~${parseFloat(estimatedFee).toFixed(8)} ${nativeCurrency.symbol}` : '-'}</Text>
              {estimatedFeeUsd && (
                <Text fontSize="12px" color="textSubtle">
                  ${estimatedFeeUsd} USD
                </Text>
              )}
            </Box>
          </Flex>

          <Button onClick={isChainMatched ? onConfirm : () => switchNetworkAsync(asset.chainId)} width="100%">
            {isChainMatched ? t('Send') : t('Switch Network')}
          </Button>
        </ColumnCenter>
      </Section>
    </Wrapper>
  )
}

// Transaction Submitted Screen
export function TransactionSubmittedContent({
  chainId,
  hash,
  onDismiss,
}: {
  onDismiss?: () => void
  hash: string | undefined
  chainId?: ChainId
}) {
  const { t } = useTranslation()

  return (
    <Wrapper>
      <Section>
        <ConfirmedIcon>
          <Spinner size={96} />
        </ConfirmedIcon>
        <AutoColumn gap="12px" justify="center">
          <Text fontSize="20px">{t('Transaction submitted')}</Text>
          {chainId && hash && (
            <Link external small href={getBlockExploreLink(hash, 'transaction', chainId)}>
              {t('View on %site%', {
                site: getBlockExploreName(chainId),
              })}
            </Link>
          )}
          {onDismiss && (
            <Button onClick={onDismiss} mt="20px">
              {t('Close')}
            </Button>
          )}
        </AutoColumn>
      </Section>
    </Wrapper>
  )
}

// Transaction Completed Screen
export function TransactionCompletedContent({
  chainId,
  hash,
  onDismiss,
  asset,
  amount,
  recipient,
}: {
  onDismiss?: () => void
  hash: string | undefined
  chainId?: ChainId
  asset: BalanceData
  amount: string
  recipient: string
}) {
  const { t } = useTranslation()

  return (
    <Wrapper>
      <Section>
        <ConfirmedIcon>
          <CheckmarkCircleIcon color="success" width="90px" />
        </ConfirmedIcon>
        <AutoColumn gap="12px" justify="center">
          <Box>
            <Text fontSize="20px" textAlign="center" bold>
              {t('Transaction completed')}
            </Text>
          </Box>
          <Box background="backgroundAlt" padding="16px" borderRadius="16px" width="100%">
            <Text textAlign="center">
              {amount} {asset.token.symbol} {t('has been sent to')} {recipient.slice(0, 6)}...{recipient.slice(-4)}
            </Text>
          </Box>
          {chainId && hash && (
            <Link external small href={getBlockExploreLink(hash, 'transaction', chainId)}>
              {t('View on %site%', {
                site: getBlockExploreName(chainId),
              })}
            </Link>
          )}
          {onDismiss && (
            <Button onClick={onDismiss} mt="20px" width="100%">
              {t('Done')}
            </Button>
          )}
        </AutoColumn>
      </Section>
    </Wrapper>
  )
}

const SendTransactionContent: React.FC<React.PropsWithChildren<SendTransactionModalProps>> = ({
  asset,
  amount,
  recipient,
  onDismiss,
  txHash,
  attemptingTxn,
  pendingText,
  onConfirm,
  chainId,
  estimatedFee,
  estimatedFeeUsd,
}) => {
  const { t } = useTranslation()

  const handleDismiss = useCallback(() => {
    onDismiss?.()
  }, [onDismiss])

  if (!chainId) return null

  return (
    <Box>
      {attemptingTxn ? (
        <ConfirmationPendingContent pendingText={pendingText || t('Sending tokens')} />
      ) : txHash ? (
        <TransactionCompletedContent
          chainId={chainId}
          hash={txHash}
          onDismiss={handleDismiss}
          asset={asset}
          amount={amount}
          recipient={recipient}
        />
      ) : (
        <ConfirmTransactionContent
          asset={asset}
          amount={amount}
          recipient={recipient}
          onConfirm={onConfirm}
          estimatedFee={estimatedFee}
          estimatedFeeUsd={estimatedFeeUsd}
        />
      )}
    </Box>
  )
}

export default SendTransactionContent
