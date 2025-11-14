import { useDebounce, useSortedTokensByQuery } from '@pancakeswap/hooks'
import { useTranslation } from '@pancakeswap/localization'
/* eslint-disable no-restricted-syntax */
import { ChainId, Currency, getTokenComparator, Token } from '@pancakeswap/sdk'
import { createFilterToken, WrappedTokenInfo } from '@pancakeswap/token-lists'
import {
  AutoColumn,
  Box,
  CogIcon,
  Column,
  Flex,
  IconButton,
  ModalCloseButton,
  ModalTitle,
  Spinner,
  Text,
  useMatchBreakpoints,
} from '@pancakeswap/uikit'
import { useAudioPlay } from '@pancakeswap/utils/user'
import { ChangeEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FixedSizeList } from 'react-window'
import { isAddress } from 'viem'

import { useActiveChainId } from 'hooks/useActiveChainId'
import useNativeCurrency from 'hooks/useNativeCurrency'
import { useAllLists, useInactiveListUrls } from 'state/lists/hooks'
import { safeGetAddress } from 'utils'

import { UpdaterByChainId } from 'state/lists/updater'
import { useAllTokenBalances } from 'state/wallet/hooks'
import { getTokenAddressFromSymbolAlias } from 'utils/getTokenAlias'
import { useAccount } from 'wagmi'
import { ENS_NAME_REGEX, useGetENSAddressByName } from 'hooks/useGetENSAddressByName'
import { useAllTokens, useIsUserAddedToken, useToken } from '../../hooks/Tokens'
import Row from '../Layout/Row'
import CommonBases, { BaseWrapper } from './CommonBases'
import CurrencyList from './CurrencyList'
import { CurrencySearchInput } from './CurrencySearchInput'
import ImportRow from './ImportRow'
import SwapNetworkSelection from './SwapNetworkSelection'
import { getSwapSound } from './swapSound'


interface CurrencySearchProps {
  selectedCurrency?: Currency | null
  onCurrencySelect: (currency: Currency) => void
  otherSelectedCurrency?: Currency | null
  showSearchInput?: boolean
  showCommonBases?: boolean
  commonBasesType?: string
  showImportView: () => void
  setImportToken: (token: Token) => void
  height?: number
  tokensToShow?: Token[]
  showChainLogo?: boolean
  showSearchHeader?: boolean
  headerTitle?: React.ReactNode
  onDismiss?: () => void
  setSelectedChainId: (chainId: ChainId) => void
  selectedChainId?: ChainId
  mode?: string
  supportCrossChain?: boolean
  onSettingsClick?: () => void
}

function useSearchInactiveTokenLists(search: string | undefined, minResults = 10): WrappedTokenInfo[] {
  const lists = useAllLists()
  const inactiveUrls = useInactiveListUrls()

  const { chainId } = useActiveChainId()

  const activeTokens = useAllTokens()

  return useMemo(() => {
    if (!search || search.trim().length === 0) return []
    const filterToken = createFilterToken(search, (address) => isAddress(address))
    const exactMatches: WrappedTokenInfo[] = []
    const rest: WrappedTokenInfo[] = []
    const addressSet: { [address: string]: true } = {}
    const trimmedSearchQuery = search.toLowerCase().trim()
    for (const url of inactiveUrls) {
      const list = lists[url]?.current
      // eslint-disable-next-line no-continue
      if (!list) continue
      for (const tokenInfo of list.tokens) {
        if (
          tokenInfo.chainId === chainId &&
          !(tokenInfo.address in activeTokens) &&
          !addressSet[tokenInfo.address] &&
          filterToken(tokenInfo)
        ) {
          const wrapped: WrappedTokenInfo = new WrappedTokenInfo({
            ...tokenInfo,
            address: safeGetAddress(tokenInfo.address) || tokenInfo.address,
          })
          addressSet[wrapped.address] = true
          if (
            tokenInfo.name?.toLowerCase() === trimmedSearchQuery ||
            tokenInfo.symbol?.toLowerCase() === trimmedSearchQuery
          ) {
            exactMatches.push(wrapped)
          } else {
            rest.push(wrapped)
          }
        }
      }
    }
    return [...exactMatches, ...rest].slice(0, minResults)
  }, [activeTokens, chainId, inactiveUrls, lists, minResults, search])
}

function CurrencySearch({
  selectedCurrency,
  onCurrencySelect,
  otherSelectedCurrency,
  showCommonBases,
  commonBasesType,
  showSearchInput = true,
  showImportView,
  setImportToken,
  height,
  tokensToShow,
  showChainLogo,
  showSearchHeader,
  onDismiss,
  headerTitle,
  setSelectedChainId,
  selectedChainId,
  mode,
  supportCrossChain = false,
  onSettingsClick,
}: CurrencySearchProps) {
  const { t } = useTranslation()
  const account = useAccount()
  const [searchQuery, setSearchQuery] = useState<string>('')
  const debouncedQuery = useDebounce(getTokenAddressFromSymbolAlias(searchQuery, selectedChainId, searchQuery), 200)
  // refs for fixed size lists
  const fixedList = useRef<FixedSizeList>()

  const { isMobile } = useMatchBreakpoints()
  const [audioPlay] = useAudioPlay()

  // === use all tokens and native currency related to the chainId

  const allTokens = useAllTokens(selectedChainId)
  const native = useNativeCurrency(selectedChainId)

  const searchToken = useToken(debouncedQuery, selectedChainId)

  // if they input an address, use it
  const searchTokenIsAdded = useIsUserAddedToken(searchToken, selectedChainId)

  // if no results on main list, show option to expand into inactive
  const filteredInactiveTokens = useSearchInactiveTokenLists(debouncedQuery)

  // ====

  const showNative: boolean = useMemo(() => {
    if (tokensToShow) return false
    const s = debouncedQuery.toLowerCase().trim()
    return native && native.symbol?.toLowerCase?.()?.indexOf(s) !== -1
  }, [debouncedQuery, native, tokensToShow])

  const filteredTokens: Token[] = useMemo(() => {
    const filterToken = createFilterToken(debouncedQuery, (address) => isAddress(address))
    return Object.values(tokensToShow || allTokens).filter(filterToken)
  }, [tokensToShow, allTokens, debouncedQuery])

  const filteredQueryTokens = useSortedTokensByQuery(filteredTokens, debouncedQuery)

  const { balances, isLoading: isLoadingBalances } = useAllTokenBalances(selectedChainId)

  const filteredSortedTokens: Token[] = useMemo(() => {
    const tokenComparator = getTokenComparator(balances ?? {})

    return [...filteredQueryTokens].sort(tokenComparator)
  }, [filteredQueryTokens, balances])

  const handleCurrencySelect = useCallback(
    (currency: Currency) => {
      onCurrencySelect(currency)
      if (audioPlay) {
        getSwapSound().play()
      }
    },
    [audioPlay, onCurrencySelect],
  )

  // manage focus on modal show
  const inputRef = useRef<HTMLInputElement>()

  useEffect(() => {
    if (!isMobile) inputRef.current?.focus()
  }, [isMobile])

  const ensAddress = useGetENSAddressByName(debouncedQuery)

  const handleOnInput = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    let input = event.target.value

    if (ENS_NAME_REGEX.test(input) && ensAddress) {
      input = ensAddress
    }
    const checksummedInput = safeGetAddress(input)
    setSearchQuery(checksummedInput || input)
    fixedList.current?.scrollTo(0)
  }, [])

  const handleEnter = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        const s = debouncedQuery.toLowerCase().trim()
        if (s === native.symbol.toLowerCase().trim()) {
          handleCurrencySelect(native)
        } else if (filteredSortedTokens.length > 0) {
          if (
            filteredSortedTokens[0].symbol?.toLowerCase() === debouncedQuery.trim().toLowerCase() ||
            filteredSortedTokens.length === 1
          ) {
            handleCurrencySelect(filteredSortedTokens[0])
          }
        }
      }
    },
    [debouncedQuery, filteredSortedTokens, handleCurrencySelect, native],
  )

  const hasFilteredInactiveTokens = Boolean(filteredInactiveTokens?.length)

  const getCurrencyListRows = useCallback(() => {
    if (searchToken && !searchTokenIsAdded && !hasFilteredInactiveTokens) {
      return (
        <Column style={{ padding: '20px 0', height: '100%' }}>
          <ImportRow
            chainId={selectedChainId}
            onCurrencySelect={handleCurrencySelect}
            token={searchToken}
            showImportView={showImportView}
            setImportToken={setImportToken}
          />
        </Column>
      )
    }

    return Boolean(filteredSortedTokens?.length) || hasFilteredInactiveTokens ? (
      <Box mx="-24px" mt="20px" height="100%">
        <CurrencyList
          height={isMobile ? (showCommonBases ? height || 250 : height ? height + 80 : 350) : 340}
          showNative={showNative}
          currencies={filteredSortedTokens}
          inactiveCurrencies={filteredInactiveTokens}
          breakIndex={
            Boolean(filteredInactiveTokens?.length) && filteredSortedTokens ? filteredSortedTokens.length : undefined
          }
          onCurrencySelect={handleCurrencySelect}
          otherCurrency={otherSelectedCurrency}
          selectedCurrency={selectedCurrency}
          fixedListRef={fixedList}
          showImportView={showImportView}
          setImportToken={setImportToken}
          showChainLogo={showChainLogo}
          chainId={selectedChainId}
        />
      </Box>
    ) : (
      <Column style={{ padding: '20px', height: '100%' }}>
        <Text color="textSubtle" textAlign="center" mb="20px">
          {t('No results found.')}
        </Text>
      </Column>
    )
  }, [
    filteredInactiveTokens,
    filteredSortedTokens,
    handleCurrencySelect,
    hasFilteredInactiveTokens,
    otherSelectedCurrency,
    searchToken,
    searchTokenIsAdded,
    selectedCurrency,
    setImportToken,
    showNative,
    showImportView,
    t,
    showCommonBases,
    isMobile,
    height,
    showChainLogo,
    selectedChainId,
  ])

  return (
    <>
      {selectedChainId ? <UpdaterByChainId chainId={selectedChainId} /> : null}

      {showSearchHeader && (
        <ModalTitle my="12px" display="flex" flexDirection="column">
          <Flex justifyContent="space-between" alignItems="center" width="100%">
            <Text fontSize="20px" mr="16px" bold>
              {headerTitle}
            </Text>
            <Box mr="-16px">
              <ModalCloseButton onDismiss={onDismiss} padding="0" />
            </Box>
          </Flex>
          <Flex width="100%" alignItems="center">
            <CurrencySearchInput
              autoFocus={false}
              inputRef={inputRef}
              handleEnter={handleEnter}
              onInput={handleOnInput}
              compact
            />

            {onSettingsClick && (
              <IconButton onClick={onSettingsClick} variant="text" scale="sm" ml="8px">
                <BaseWrapper style={{ padding: '6px' }}>
                  <CogIcon height={24} width={24} color="textSubtle" />
                </BaseWrapper>
              </IconButton>
            )}
          </Flex>
        </ModalTitle>
      )}
      <AutoColumn gap="16px">
        {showSearchInput && !showSearchHeader && (
          <Row>
            <CurrencySearchInput inputRef={inputRef} handleEnter={handleEnter} onInput={handleOnInput} />
          </Row>
        )}
        {supportCrossChain ? (
          <SwapNetworkSelection
            chainId={selectedChainId}
            onSelect={(currentChainId) => setSelectedChainId(currentChainId)}
            isDependent={mode === 'swap-currency-output'}
          />
        ) : null}

        {showCommonBases && (
          <CommonBases
            supportCrossChain={supportCrossChain}
            chainId={selectedChainId}
            onSelect={handleCurrencySelect}
            selectedCurrency={selectedCurrency}
            commonBasesType={commonBasesType}
          />
        )}
      </AutoColumn>
      {account && isLoadingBalances ? (
        <Flex width="100%" justifyContent="center" alignItems="center" pt="24px">
          <Spinner />
        </Flex>
      ) : (
        getCurrencyListRows()
      )}
    </>
  )
}

export default CurrencySearch
