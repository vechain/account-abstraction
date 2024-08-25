import { VECHAIN_URL_SOLO } from '@vechain/hardhat-vechain'

export interface DebugLog {
  pc: number
  op: string
  gasCost: number
  depth: number
  stack: string[]
  memory: string[]
}

export interface DebugTransactionResult {
  gas: number
  failed: boolean
  returnValue: string
  structLogs: DebugLog[]
}

export async function debugTracers (blockHash: string, txHash: string, clauseNumber?: number, url?: string): Promise<DebugTransactionResult> {
  const result = await fetch(`${url ?? VECHAIN_URL_SOLO}/debug/tracers`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: '',
      target: `${blockHash}/${txHash}/${clauseNumber ?? 0}`
    })
  })

  return result.json()
}
