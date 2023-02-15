import { createClient, Prisma } from '@sushiswap/database'
import { performance } from 'perf_hooks'

export async function whitelistPools() {
  try {
    const startTime = performance.now()

    await start()

    const endTime = performance.now()
    console.log(`COMPLETED (${((endTime - startTime) / 1000).toFixed(1)}s). `)
  } catch (e) {
    console.error(e)
    await (await createClient()).$disconnect()
  } finally {
    await (await createClient()).$disconnect()
  }
}

async function start() {
  const client = await createClient()
  const approvedTokensResult = await client.token.findMany({
    select: {
      id: true,
    },
    where: {
      status: 'APPROVED',
    },
  })

  const approvedTokens = approvedTokensResult.map((token) => token.id)
  console.log(`Fetched ${approvedTokens.length} approved tokens.`)

  const batchSize = 10000
  let cursor = null
  const poolsToUpdate: string[] = []
  let totalCount = 0

  do {
    const requestStartTime = performance.now()
    let result = []
    if (!cursor) {
      result = await getPoolsAddresses(approvedTokens, batchSize)
    } else {
      result = await getPoolsAddresses(approvedTokens, batchSize, 1, { id: cursor })
    }
    cursor = result.length == batchSize ? result[result.length - 1].id : null
    totalCount += result.length

    poolsToUpdate.push(...result.map((pool) => pool.id))
    const requestEndTime = performance.now()
    if (result.length > 0) {
      console.log(
        `Fetched a batch of pool addresses with ${result.length} (${(
          (requestEndTime - requestStartTime) /
          1000
        ).toFixed(1)}s). cursor: ${cursor}, pool count that needs whitelisting: ${result.length}`
      )
    } else {
      console.log(`No pools needs whitelisting.`)
    }
  } while (cursor != null)

  const updatePoolsBatchSize = 200
  let updatePoolCount = 0
  for (let i = 0; i < poolsToUpdate.length; i += updatePoolsBatchSize) {
    const batch = poolsToUpdate.slice(i, i + updatePoolsBatchSize)
    const batchToUpdate = batch.map((id) =>
      client.pool.update({
        where: {
          id,
        },
        data: {
          isWhitelisted: true,
        },
      })
    )
    const poolsUpdated = await Promise.allSettled(batchToUpdate)

    console.log(`LOAD - ${poolsUpdated.length} pools whitelisted.`)
    updatePoolCount += poolsUpdated.length
  }
  console.log(`LOAD - COMPLETE, ${updatePoolCount} pools whitelisted.`)
}

async function getPoolsAddresses(
  approvedIds: string[],
  take: number,
  skip?: number,
  cursor?: Prisma.PoolWhereUniqueInput
) {
  const client = await createClient()
  const approvedTokens = await client.pool.findMany({
    take,
    skip,
    cursor,
    select: {
      id: true,
    },
    where: {
      isWhitelisted: false,
      token0Id: { in: approvedIds },
      token1Id: { in: approvedIds },
    },
  })

  return approvedTokens
}
