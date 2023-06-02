import { getAddress, isAddress } from '@ethersproject/address'
import { AddressZero } from '@ethersproject/constants'
import { DownloadIcon } from '@heroicons/react/outline'
import { nanoid } from 'nanoid'
import { ChainId } from '@sushiswap/chain'
import { Native, Token, Type } from '@sushiswap/currency'
import { FundSource } from '@sushiswap/hooks'
import { Dropzone, NetworkIcon } from '@sushiswap/ui'
import { Address, fetchToken, FetchTokenResult } from '@sushiswap/wagmi'
import { FC, useCallback } from 'react'
import { useFieldArray, useFormContext } from 'react-hook-form'

import { useImportErrorContext } from '../../vesting/CreateMultipleForm/ImportErrorContext'
import { CreateStreamFormSchemaType } from '../CreateForm'
import { CreateMultipleStreamFormSchemaType } from './schema'
import { Button } from '@sushiswap/ui/future/components/button'
import { Form } from '@sushiswap/ui'
import dynamic from 'next/dynamic'

interface ImportZoneSection {
  chainId: ChainId
}

const Component: FC<ImportZoneSection> = ({ chainId }) => {
  const { errors, setErrors } = useImportErrorContext<CreateMultipleStreamFormSchemaType>()
  const { control, trigger, watch } = useFormContext<CreateMultipleStreamFormSchemaType>()
  const { append } = useFieldArray({
    control,
    name: 'streams',
    shouldUnregister: true,
  })

  const streams = watch('streams')
  const nrOfStreams = streams?.length || 0

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      acceptedFiles.forEach((file) => {
        const reader = new FileReader()
        reader.onload = async () => {
          const { result } = reader
          if (typeof result === 'string') {
            // Split and remove header
            const arr = result.split(/\r?\n/)

            // If the CSV has a header, remove the first line
            if (arr.length > 0) {
              const [tokenAddress] = arr[0].split(',')
              try {
                getAddress(tokenAddress)
              } catch (e) {
                arr.shift()
              }
            }

            const rows: CreateStreamFormSchemaType[] = []
            const tokens = await Promise.all(
              arr.reduce<Promise<void | FetchTokenResult>[]>((acc, cur, index) => {
                if (cur !== '') {
                  const [tokenAddress] = cur.split(',') as [Address]
                  if (tokenAddress !== AddressZero) {
                    acc.push(
                      fetchToken({ address: tokenAddress, chainId }).catch(() => {
                        if (!errors.streams?.[index]) {
                          errors.streams = []
                        }

                        errors.streams[index + nrOfStreams] = {
                          amount: {
                            type: 'custom',
                            message: `${tokenAddress} was not found`,
                          },
                        }
                      })
                    )
                  }
                }

                return acc
              }, [])
            )

            const tokenMap = tokens?.reduce<Record<string, Token>>((acc, result) => {
              if (result) {
                const { address, symbol, decimals } = result
                acc[address.toLowerCase()] = new Token({
                  address,
                  symbol,
                  decimals,
                  chainId,
                })
              }
              return acc
            }, {})

            arr?.forEach((cur, index) => {
              if (cur !== '') {
                const [tokenAddress, fundSource, amount, recipient, startDate, endDate] = cur.split(',')

                if (!errors.streams?.[index]) {
                  errors.streams = []
                }

                let _startDate: Date | null = new Date(Number(startDate) * 1000)
                let _endDate: Date | null = new Date(Number(endDate) * 1000)
                let _recipient: string | undefined = recipient
                let _currency: Type | undefined =
                  tokenAddress.toLowerCase() === AddressZero.toLowerCase()
                    ? Native.onChain(chainId)
                    : tokenMap?.[tokenAddress.toLowerCase()]

                if (errors.streams[index + nrOfStreams]?.amount) {
                  _currency = undefined
                }

                if (!isAddress(recipient)) {
                  _recipient = undefined
                  errors.streams[index + nrOfStreams] = {
                    ...errors.streams[index + nrOfStreams],
                    recipient: {
                      type: 'custom',
                      message: `${recipient} is not a valid address`,
                    },
                  }
                }

                if (isNaN(_startDate.getTime())) {
                  _startDate = null
                  errors.streams[index + nrOfStreams] = {
                    ...errors.streams[index + nrOfStreams],
                    dates: {
                      startDate: {
                        type: 'custom',
                        message: `${startDate} is not a valid unix timestamp`,
                      },
                    },
                  }
                }

                if (isNaN(_endDate.getTime())) {
                  _endDate = null
                  errors.streams[index + nrOfStreams] = {
                    ...errors.streams[index + nrOfStreams],
                    dates: {
                      ...errors.streams[index + nrOfStreams]?.dates,
                      endDate: {
                        type: 'custom',
                        message: `${endDate} is not a valid unix timestamp`,
                      },
                    },
                  }
                }

                rows.push({
                  id: nanoid(),
                  fundSource: Number(fundSource) === 0 ? FundSource.WALLET : FundSource.BENTOBOX,
                  recipient: _recipient,
                  currency: _currency,
                  amount,
                  dates: {
                    startDate: _startDate || new Date(0),
                    endDate: _endDate || new Date(0),
                  },
                })
              }
            }, [])

            append(rows)
            await trigger()
            setErrors(errors)
          }
        }

        reader.readAsText(file)
      })
    },
    [append, chainId, errors, nrOfStreams, setErrors, trigger]
  )

  const downloadExample = useCallback(() => {
    const encodedUri = encodeURI(
      'data:text/csv;charset=utf-8,Currency Address,Funding Source (0 = WALLET 1 = BentoBox),Amount,Recipient,Start Date (Unix Epoch Timestamp),End Date (Unix Epoch Timestamp)\n0x0000000000000000000000000000000000000000,0,0.0001,0x19B3Eb3Af5D93b77a5619b047De0EED7115A19e7,1661440124,1661872124'
    )
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', 'sushi_stream_def_example.csv')
    document.body.appendChild(link)
    link.click()
  }, [])

  return (
    <Form.Section
      title="Quick Import"
      description={
        <div className="flex flex-col gap-6">
          <span>
            Autofill your list by uploading a .csv file to save time and effort! Please use the demo file to check if
            your data is formatted correctly.
          </span>
          <div>
            <Button
              size="lg"
              type="button"
              onClick={downloadExample}
              startIcon={<DownloadIcon width={20} height={20} />}
            >
              Example
            </Button>
          </div>
        </div>
      }
    >
      <div className="relative grid">
        <div className="absolute -mt-2 -ml-2">
          <NetworkIcon chainId={chainId} className="w-6 h-6" />
        </div>
        <Dropzone
          accept={{
            'text/csv': ['.csv'],
          }}
          onDrop={onDrop}
        />
      </div>
    </Form.Section>
  )
}

export const ImportZoneSection = dynamic(() => Promise.resolve(Component), { ssr: false })
