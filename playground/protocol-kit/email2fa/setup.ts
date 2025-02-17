import Safe, { SafeAccountConfig, getSafeAddressFromDeploymentTx } from '@safe-global/protocol-kit'
import { SafeTransactionDataPartial, SafeVersion } from '@safe-global/types-kit'

import { createPublicClient, createWalletClient, encodeAbiParameters, http, keccak256, parseEther } from 'viem'
import { getContract } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { waitForTransactionReceipt } from 'viem/actions'
import semverSatisfies from 'semver/functions/satisfies'
import { EMAIL_SIGNER_FACTORY_ABI, EMAIL_SIGNER_ABI } from './abi'
import fs from 'fs'
import path from 'path'

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
const ENABLE_LOGS = true // Easy kill switch for logs
const PROOFS_CACHE_DIR = path.join(__dirname, 'proofs-cache')

const log = (...args: any[]) => {
  if (ENABLE_LOGS) {
    console.log(...args)
  }
}

const account = privateKeyToAccount(`0x${DEPLOYER_PRIVATE_KEY}`)

const email = "snparvizi75@gmail.com"
// any random 32 bytes value works
const accountCode = "0x22a2d51a892f866cf3c6cc4e138ba87a8a5059a1d80dea5b8ee8232034a105b7"

// Create cache directory if it doesn't exist
if (!fs.existsSync(PROOFS_CACHE_DIR)) {
  fs.mkdirSync(PROOFS_CACHE_DIR, { recursive: true })
}

async function getOrGenerateProof(txNonce: string, txHashToSign: bigint, templateId: string) {
  const cacheFile = path.join(PROOFS_CACHE_DIR, `proof-${txNonce}.json`)

  // Check if proof exists in cache
  if (fs.existsSync(cacheFile)) {
    log('Found cached proof for nonce:', txNonce)
    const cachedProof = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
    return cachedProof
  }

  log('Generating new proof for nonce:', txNonce)

  // Request new proof from relayer
  const relayerResponse = await fetch(`${RELAYER_URL}/api/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      accountCode: accountCode,
      codeExistsInEmail: true,
      commandTemplate: 'signHash {uint}',
      commandParams: [txHashToSign.toString()],
      templateId: templateId,
      emailAddress: email,
      subject: 'Safe Transaction Signature Request',
      body: `Please sign the safe transaction`,
    })
  })

  if (!relayerResponse.ok) {
    throw new Error(`Failed to get email signature: ${await relayerResponse.text()}`)
  }

  const emailSignature = await relayerResponse.json()
  const emailProofId = emailSignature.id

  // Poll for proof
  let emailAuthMsg;
  let retries = 0
  const maxRetries = 100
  while (!emailAuthMsg && retries < maxRetries) {
    try {
      const statusResponse = await fetch(`${RELAYER_URL}/api/status/${emailProofId}`)

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text()
        throw new Error(`Failed to get proof status: ${errorText}`)
      }

      const status = await statusResponse.json()

      if (status.error) {
        throw new Error(`Error getting proof: ${status.error}`)
      }

      if (status.response) {
        emailAuthMsg = status.response
        break
      }

      retries++
      await new Promise(resolve => setTimeout(resolve, 2000))

    } catch (error) {
      retries++
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  if (!emailAuthMsg) {
    throw new Error('Timed out waiting for email proof')
  }

  // Cache the proof
  fs.writeFileSync(cacheFile, JSON.stringify(emailAuthMsg))

  return emailAuthMsg
}

const client = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(RPC_URL)
})

// Check if there is already a contract deployed at the email signer address
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL)
})

async function getOrDeployEmailSigner(accountCode: string, email: string) {
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

  log('emailAccountSalt: ', accountSalt)

  const emailSignerFactory = getContract({
    address: EMAIL_SIGNER_FACTORY_ADDRESS,
    abi: EMAIL_SIGNER_FACTORY_ABI,
    client
  })

  // get the address of the email signer
  const emailSignerAddress = await emailSignerFactory.read.predictAddress([accountSalt]) as `0x${string}`

  const bytecode = await publicClient.getCode({
    address: emailSignerAddress
  })
  log('emailSignerAddress: ', emailSignerAddress)

  let isEmailSignerDeployed = bytecode !== undefined && bytecode !== '0x'
  log('Email signer contract deployed:', isEmailSignerDeployed)

  // Deploy email signer if not already deployed
  if (!isEmailSignerDeployed) {
    log('Deploying email signer contract...')
    const deployTx = await emailSignerFactory.write.deploy([accountSalt])
    await waitForTransactionReceipt(client, { hash: deployTx })
    log('Email signer contract deployed successfully')
    isEmailSignerDeployed = true
  } else {
    log('Email signer contract already deployed')
  }

  return emailSignerAddress
}

async function setupSafe(emailSignerAddress: string) {
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

  log('Safe Account config: ', config.DEPLOY_SAFE)

  // Config of the deployed Safe
  const safeAccountConfig: SafeAccountConfig = {
    owners: config.DEPLOY_SAFE.OWNERS,
    threshold: config.DEPLOY_SAFE.THRESHOLD
  }

  const safeVersion = config.DEPLOY_SAFE.SAFE_VERSION as SafeVersion
  const saltNonce = config.DEPLOY_SAFE.SALT_NONCE

  // protocol-kit instance creation
  let protocolKit = await Safe.init({
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
    log('Safe Account deployed: ', isSafeDeployed)

    // Predict deployed address
    const predictedSafeAddress = await protocolKit.getAddress()
    log('Predicted Safe address:', predictedSafeAddress)

    if (!isSafeDeployed) {
      log('Deploying Safe Account...')
      // Deploy the Safe account
      const deploymentTransaction = await protocolKit.createSafeDeploymentTransaction()
      log('deploymentTransaction: ', deploymentTransaction)

      const txHash = await client.sendTransaction({
        to: deploymentTransaction.to,
        value: BigInt(deploymentTransaction.value),
        data: deploymentTransaction.data as `0x${string}`
      })

      log('Transaction hash:', txHash)

      const txReceipt = await waitForTransactionReceipt(client, { hash: txHash })
      const safeAddress = getSafeAddressFromDeploymentTx(txReceipt, safeVersion)
      log('safeAddress:', safeAddress)
    }
  }

  // Reinitialize the Safe instance regardless of whether it was just deployed or already existed
  protocolKit = await Safe.init({
    provider: config.RPC_URL,
    signer: config.DEPLOYER_ADDRESS_PRIVATE_KEY,
    safeAddress: await protocolKit.getAddress()
  })

  // Only log Safe details if it's deployed
  log('Safe Address:', await protocolKit.getAddress())
  log('Safe Owners:', await protocolKit.getOwners())
  log('Safe Threshold:', await protocolKit.getThreshold())

  return protocolKit
}
async function depositInitialFunds(protocolKit: Safe) {
  // Check Safe balance and deposit initial funds if needed
  const safeBalance = await publicClient.getBalance({ address: await protocolKit.getAddress() })

  if (safeBalance === 0n) {
    log('Safe balance is zero, depositing initial funds...')
    const depositTx = await client.sendTransaction({
      to: await protocolKit.getAddress(),
      value: parseEther('0.001')
    })
    log('Deposit transaction hash:', depositTx)
    await waitForTransactionReceipt(client, { hash: depositTx })
    log('Initial funds deposited successfully')
  }
}
async function createTestTransaction(safeInstance: Safe) {
  // Create and execute a test transfer transaction
  log('Creating test transfer transaction...')
  const owners = await safeInstance.getOwners()
  const destinationAddress = owners[0] // Send to first owner
  const transferAmount = parseEther('0.0001') // Transfer a small amount

  const safeTransactionData: SafeTransactionDataPartial = {
    to: destinationAddress,
    data: '0x',
    value: transferAmount.toString()
  }

  // Create the transaction
  const safeTransaction = await safeInstance.createTransaction({ transactions: [safeTransactionData] })
  log('Transaction created:', safeTransaction)
  return safeTransaction
}

async function getEmailSignature(safeTransaction: any, emailSignerAddress: string, safeTxHash: string) {
  // Get the transaction hash that needs to be signed
  const txHashToSign = BigInt(safeTxHash)

  const emailSigner = getContract({
    address: emailSignerAddress,
    abi: EMAIL_SIGNER_ABI,
    client
  })

  // Get templateId from email signer contract
  const templateId = `0x${((await emailSigner.read.templateId([])) as bigint).toString(16)}`

  log('Template ID:', templateId)
  log('DKIM Contract Address:', await emailSigner.read.dkimRegistryAddr())
  log('txHashToSign:', txHashToSign.toString())

  // Get or generate proof using transaction nonce as cache key
  const emailAuthMsg = await getOrGenerateProof(safeTransaction.data.nonce.toString(), txHashToSign, templateId)

  log('Email auth message received:', emailAuthMsg)

  // Then encode the full EmailAuthMsg struct
  const smartContractSignature = encodeAbiParameters(
    [{
      type: 'tuple',
      components: [
        { type: 'uint256', name: 'templateId' },
        { type: 'bytes[]', name: 'commandParams' },
        { type: 'uint256', name: 'skippedCommandPrefix' },
        {
          type: 'tuple',
          name: 'proof',
          components: [
            { type: 'string', name: 'domainName' },
            { type: 'bytes32', name: 'publicKeyHash' },
            { type: 'uint256', name: 'timestamp' },
            { type: 'string', name: 'maskedCommand' },
            { type: 'bytes32', name: 'emailNullifier' },
            { type: 'bytes32', name: 'accountSalt' },
            { type: 'bool', name: 'isCodeExist' },
            { type: 'bytes', name: 'proof' }
          ]
        }
      ]
    }],
    [{
      templateId: emailAuthMsg.templateId,
      commandParams: emailAuthMsg.commandParams,
      skippedCommandPrefix: emailAuthMsg.skippedCommandPrefix,
      proof: emailAuthMsg.proof
    }]
  )


  log('Encoded email auth message:', smartContractSignature)
  const isValidSignature = await emailSigner.read.isValidSignature([safeTxHash, smartContractSignature])
  log('isValidSignature:', isValidSignature)

  return smartContractSignature
}

async function main() {
  const emailSignerAddress = await getOrDeployEmailSigner(accountCode, email)
  const safeInstance = await setupSafe(emailSignerAddress)
  await depositInitialFunds(safeInstance) // deposit some funds to the safe for testing
  const safeTransaction = await createTestTransaction(safeInstance)

  // Sign transaction with first signer
  const signedSafeTx = await safeInstance.signTransaction(safeTransaction)
  log('Transaction signed by first signer:', signedSafeTx)

  // Get transaction hash that other signers can use to sign
  const safeTxHash = await safeInstance.getTransactionHash(safeTransaction)
  log('Transaction hash for other signers:', safeTxHash)

  // Request email signature from relayer
  log('Requesting email signature from relayer...')
  const smartContractSignature = await getEmailSignature(safeTransaction, emailSignerAddress, safeTxHash)

}

main()
