import { ChainId } from '@pancakeswap/chains'
import { useActiveChainId } from 'hooks/useActiveChainId'
import { useSidNameForAddress } from 'hooks/useSid'
import { useUnsNameForAddress } from 'hooks/useUns'
import { useMemo } from 'react'
import { Address } from 'viem'
import { useEnsAvatar, useEnsName, useEnsText } from 'wagmi'

export const useDomainNameForAddress = (address?: `0x${string}` | string, fetchData = true) => {
  const { chainId } = useActiveChainId()
  const { sidName, isLoading: isSidLoading } = useSidNameForAddress(address as Address, fetchData)
  const { unsName, isLoading: isUnsLoading } = useUnsNameForAddress(
    address as Address,
    fetchData && !sidName && !isSidLoading,
  )
  const { data: ensName, isLoading: isEnsLoading } = useEnsName({
    address: address as Address,
    chainId: chainId === ChainId.GOERLI ? ChainId.GOERLI : ChainId.ETHEREUM,
    query: {
      enabled: chainId !== ChainId.BSC_TESTNET,
    },
  })
  const { data: ensAvatar, isLoading: isEnsAvatarLoading } = useEnsAvatar({
    name: ensName as string,
    chainId: chainId === ChainId.GOERLI ? ChainId.GOERLI : ChainId.ETHEREUM,
    query: {
      enabled: chainId !== ChainId.BSC_TESTNET,
    },
  })

  const { data: ensTwitter, isLoading: isEnsTwitterLoading } = useEnsText({
    name: ensName as string,
    chainId: chainId === ChainId.GOERLI ? ChainId.GOERLI : ChainId.ETHEREUM,
    query: {
      enabled: chainId !== ChainId.BSC_TESTNET && !!ensName && fetchData,
    },
    key: 'com.twitter'
  })

  const { data: ensGithub, isLoading: isEnsGithubLoading } = useEnsText({
    name: ensName as string,
    chainId: chainId === ChainId.GOERLI ? ChainId.GOERLI : ChainId.ETHEREUM,
    query: {
      enabled: chainId !== ChainId.BSC_TESTNET && !!ensName && fetchData,
    },
    key: 'com.github'
  })


  return useMemo(() => {
    return {
      domainName: ensName || sidName || unsName,
      avatar: ensAvatar ?? undefined,
      twitter: ensTwitter ?? undefined,
      github: ensGithub ?? undefined,
      isLoading: isEnsLoading || isEnsAvatarLoading || isEnsTwitterLoading || isEnsGithubLoading || (!ensName && isSidLoading) || (!sidName && isUnsLoading),
    }
  }, [sidName, unsName, isSidLoading, isUnsLoading, ensName, isEnsLoading, ensAvatar, isEnsAvatarLoading, ensTwitter, isEnsTwitterLoading, ensGithub, isEnsGithubLoading])
}
