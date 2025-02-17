import Safe, { SafeAccountConfig, getSafeAddressFromDeploymentTx } from '@safe-global/protocol-kit'
import { SafeTransactionDataPartial, SafeVersion } from '@safe-global/types-kit'

import { createPublicClient, createWalletClient, http, keccak256, parseEther } from 'viem'
import { getContract } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { waitForTransactionReceipt } from 'viem/actions'
import semverSatisfies from 'semver/functions/satisfies'
import { EMAIL_SIGNER_FACTORY_ABI, EMAIL_SIGNER_ABI } from './abi'
import fs from 'fs'

import * as dotenv from 'dotenv'
dotenv.config()

// This file can be used to play around with the Safe Core SDK

interface Config {
  RPC_URL: string
  DEPLOYER_ADDRESS_PRIVATE_KEY: string
  DEPLOY_SAFE: {
    OWNERS: string[]
    THRESHOLD: number
    SALT_NONCE: string
    SAFE_VERSION: string
  }
}

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_ADDRESS_PRIVATE_KEY!
const RPC_URL = process.env.RPC_URL!
const RELAYER_URL = 'http://127.0.0.1:8000'
const EMAIL_SIGNER_FACTORY_ADDRESS = '0x8eFd67b5779a9eD57e464Da18Fd207DBDDB6531f'

const account = privateKeyToAccount(`0x${DEPLOYER_PRIVATE_KEY}`)

const email = "snparvizi75@gmail.com"
// any random 32 bytes value works
const accountCode = "0x22a2d51a892f866cf3c6cc4e138ba87a8a5059a1d80dea5b8ee8232034a105b7"

async function main() {

  // first get the salt 
  const { accountSalt } = await fetch(`${RELAYER_URL}/api/accountSalt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      accountCode: accountCode,
      emailAddress: email
    })
  }).then(res => res.json())

  console.log('emailAccountSalt: ', accountSalt)
  const client = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(RPC_URL)
  })

  const emailSignerFactory = getContract({
    address: EMAIL_SIGNER_FACTORY_ADDRESS,
    abi: EMAIL_SIGNER_FACTORY_ABI,
    client
  })

  // get the address of the email signer
  const emailSignerAddress = await emailSignerFactory.read.predictAddress([accountSalt]) as `0x${string}`

  // Check if there is already a contract deployed at the email signer address
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC_URL)
  })

  const bytecode = await publicClient.getCode({
    address: emailSignerAddress
  })
  console.log('emailSignerAddress: ', emailSignerAddress)

  let isEmailSignerDeployed = bytecode !== undefined && bytecode !== '0x'
  console.log('Email signer contract deployed:', isEmailSignerDeployed)

  // Deploy email signer if not already deployed
  if (!isEmailSignerDeployed) {
    console.log('Deploying email signer contract...')
    const deployTx = await emailSignerFactory.write.deploy([accountSalt])
    await waitForTransactionReceipt(client, { hash: deployTx })
    console.log('Email signer contract deployed successfully')
    isEmailSignerDeployed = true
  } else {
    console.log('Email signer contract already deployed')
  }

  const config: Config = {
    RPC_URL: process.env.RPC_URL!,
    DEPLOYER_ADDRESS_PRIVATE_KEY: DEPLOYER_PRIVATE_KEY,
    DEPLOY_SAFE: {
      OWNERS: [account.address, emailSignerAddress],
      THRESHOLD: 2, // <SAFE_THRESHOLD>
      SALT_NONCE: '150000',
      SAFE_VERSION: '1.3.0'
    }
  }

  console.log('Safe Account config: ', config.DEPLOY_SAFE)

  // Config of the deployed Safe
  const safeAccountConfig: SafeAccountConfig = {
    owners: config.DEPLOY_SAFE.OWNERS,
    threshold: config.DEPLOY_SAFE.THRESHOLD
  }

  const safeVersion = config.DEPLOY_SAFE.SAFE_VERSION as SafeVersion
  const saltNonce = config.DEPLOY_SAFE.SALT_NONCE

  // protocol-kit instance creation
  const protocolKit = await Safe.init({
    provider: config.RPC_URL,
    signer: config.DEPLOYER_ADDRESS_PRIVATE_KEY,
    predictedSafe: {
      safeAccountConfig,
      safeDeploymentConfig: {
        saltNonce,
        safeVersion
      }
    }
  })

  // The Account Abstraction feature is only available for Safes version 1.3.0 and above.
  if (semverSatisfies(safeVersion, '>=1.3.0')) {

    const isSafeDeployed = await protocolKit.isSafeDeployed()
    console.log('Safe Account deployed: ', isSafeDeployed)

    // Predict deployed address
    const predictedSafeAddress = await protocolKit.getAddress()
    console.log('Predicted Safe address:', predictedSafeAddress)

    if (!isSafeDeployed) {
      console.log('Deploying Safe Account...')
      // Deploy the Safe account
      const deploymentTransaction = await protocolKit.createSafeDeploymentTransaction()
      console.log('deploymentTransaction: ', deploymentTransaction)

      const txHash = await client.sendTransaction({
        to: deploymentTransaction.to,
        value: BigInt(deploymentTransaction.value),
        data: deploymentTransaction.data as `0x${string}`
      })

      console.log('Transaction hash:', txHash)

      const txReceipt = await waitForTransactionReceipt(client, { hash: txHash })
      const safeAddress = getSafeAddressFromDeploymentTx(txReceipt, safeVersion)
      console.log('safeAddress:', safeAddress)

      // Connect to the newly deployed Safe
      protocolKit.connect({ safeAddress })
    }

    // Only log Safe details if it's deployed
    console.log('Safe Address:', await protocolKit.getAddress())
    console.log('Safe Owners:', await protocolKit.getOwners())
    console.log('Safe Threshold:', await protocolKit.getThreshold())

    // Check Safe balance and deposit initial funds if needed
    const safeBalance = await publicClient.getBalance({ address: await protocolKit.getAddress() })

    if (safeBalance === 0n) {
      console.log('Safe balance is zero, depositing initial funds...')
      const depositTx = await client.sendTransaction({
        to: await protocolKit.getAddress(),
        value: parseEther('0.001')
      })
      console.log('Deposit transaction hash:', depositTx)
      await waitForTransactionReceipt(client, { hash: depositTx })
      console.log('Initial funds deposited successfully')
    }

    // Create and execute a test transfer transaction
    console.log('Creating test transfer transaction...')
    const owners = await protocolKit.getOwners()
    const destinationAddress = owners[0] // Send to first owner
    const transferAmount = parseEther('0.0001') // Transfer a small amount

    const safeTransactionData: SafeTransactionDataPartial = {
      to: destinationAddress,
      data: '0x',
      value: transferAmount.toString()
    }

    // Create the transaction
    const safeTransaction = await protocolKit.createTransaction({ transactions: [safeTransactionData] })
    console.log('Transaction created:', safeTransaction)

    // Sign transaction with first signer
    const signedSafeTx = await protocolKit.signTransaction(safeTransaction)
    console.log('Transaction signed by first signer:', signedSafeTx)

    // Get transaction hash that other signers can use to sign
    const safeTxHash = await protocolKit.getTransactionHash(safeTransaction)
    console.log('Transaction hash for other signers:', safeTxHash)

    // Request email signature from relayer
    console.log('Requesting email signature from relayer...')

    // Get the transaction hash that needs to be signed
    const txHashToSign = BigInt(safeTxHash)

    const emailSigner = getContract({
      address: emailSignerAddress,
      abi: EMAIL_SIGNER_ABI,
      client
    })

    // Get templateId from email signer contract
    const templateId = `0x${((await emailSigner.read.templateId([])) as bigint).toString(16)}`

    console.log('Template ID:', templateId)
    console.log('DKIM Contract Address:', await emailSigner.read.dkimRegistryAddr())
    console.log('txHashToSign:', txHashToSign.toString())

    const relayerResponse = await fetch(`${RELAYER_URL}/api/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        accountCode: accountCode, // Use the actual tx hash
        codeExistsInEmail: true,
        commandTemplate: 'signHash {uint}',
        commandParams: [txHashToSign.toString()], // Use the actual tx hash as bigint
        templateId: templateId, // Generate unique template ID
        emailAddress: email, // This could be fetched from config/env
        subject: 'Safe Transaction Signature Request',
        body: `Please sign the safe transaction`,
      })
    })

    if (!relayerResponse.ok) {
      throw new Error(`Failed to get email signature: ${await relayerResponse.text()}`)
    }

    const emailSignature = await relayerResponse.json()
    console.log('Email signature received:', emailSignature)

    // Extract the email proof ID from the response
    const emailProofId = emailSignature.id
    console.log('Email proof ID:', emailProofId)

    // Poll the status endpoint until we get the proof
    console.log('Waiting for email proof...')
    let emailAuthMsg;
    let retries = 0
    const maxRetries = 100 // 1 minute maximum wait time
    while (!emailAuthMsg && retries < maxRetries) {
      try {
        console.debug(`Polling for email proof (attempt ${retries + 1}/${maxRetries})...`)
        const statusResponse = await fetch(`${RELAYER_URL}/api/status/${emailProofId}`)

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text()
          console.debug('Status response not OK:', {
            status: statusResponse.status,
            statusText: statusResponse.statusText,
            errorText
          })
          throw new Error(`Failed to get proof status: ${errorText}`)
        }

        const status = await statusResponse.json()
        console.debug('Received status response:', status)

        if (status.error) {
          console.debug('Status contains error:', status.error)
          throw new Error(`Error getting proof: ${status.error}`)
        }

        if (status.response) {
          console.debug('Email proof found in status response')
          emailAuthMsg = status.response
          break
        }

        retries++
        console.debug(`No proof yet, waiting 2 seconds before retry ${retries + 1}...`)
        await new Promise(resolve => setTimeout(resolve, 2000))

      } catch (error) {
        console.debug('Error while polling for proof:', error)
        retries++
        console.debug(`Waiting 2 seconds before retry ${retries + 1}...`)
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    if (!emailAuthMsg) {
      console.debug(`Timed out after ${maxRetries} attempts`)
      throw new Error('Timed out waiting for email proof')
    }

    console.log('Email auth message received:', emailAuthMsg)

    // const signedSafeTx = await protocolKit.signTransaction(safeTransaction)
    // const executeTxResponse = await protocolKit.executeTransaction(signedSafeTx)
    // console.log('Transfer transaction hash:', executeTxResponse.hash)

    // const txReceipt = await waitForTransactionReceipt(client, { hash: executeTxResponse.hash as `0x${string}` })
    // console.log('Transfer completed with status:', txReceipt.status)

  }
}

main()
