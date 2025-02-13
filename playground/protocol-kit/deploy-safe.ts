import Safe, { SafeAccountConfig, getSafeAddressFromDeploymentTx } from '@safe-global/protocol-kit'
import { SafeVersion } from '@safe-global/types-kit'

import { createPublicClient, createWalletClient, http, keccak256 } from 'viem'
import { getContract } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { waitForTransactionReceipt } from 'viem/actions'
import semverSatisfies from 'semver/functions/satisfies'
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
const account = privateKeyToAccount(`0x${DEPLOYER_PRIVATE_KEY}`)

const email = "thezdev1@gmail.com"
// any random 32 bytes value works
const accountCode = "0x22a2d51a892f866cf3c6cc4e138ba87a8a5059a1d80dea5b8ee8232034a105b7"

async function main() {

  // first get the salt 
  const { accountSalt } = await fetch('http://relayer.zk.email/api/accountSalt', {
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

  const emailSignerAbi = JSON.parse(fs.readFileSync('playground/protocol-kit/email-signer-abi.json', 'utf8'))

  const emailSignerFactory = getContract({
    address: '0xA7DEc2DC5153275E5d90A7d59F3C7B1DEff6E4b2',
    abi: emailSignerAbi,
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

  console.log('Email signer contract deployed:', bytecode !== undefined && bytecode !== '0x')

  // Deploy email signer if not already deployed
  if (bytecode === '0x' || bytecode === undefined) {
    console.log('Deploying email signer contract...')
    const deployTx = await emailSignerFactory.write.deploy([accountSalt])
    console.log('deployTx: ', deployTx)
    console.log('Email signer contract deployed successfully')
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
    // check if its deployed
    console.log('Safe Account deployed: ', await protocolKit.isSafeDeployed())

    // Predict deployed address
    const predictedSafeAddress = await protocolKit.getAddress()
    console.log('Predicted Safe address:', predictedSafeAddress)
  }

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

  // now you can use the Safe address in the instance of the protocol-kit
  protocolKit.connect({ safeAddress })

  console.log('is Safe deployed:', await protocolKit.isSafeDeployed())
  console.log('Safe Address:', await protocolKit.getAddress())
  console.log('Safe Owners:', await protocolKit.getOwners())
  console.log('Safe Threshold:', await protocolKit.getThreshold())
}

main()
