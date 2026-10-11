/**
 * Loads VetControl's real client modules for the cross-repo specs.
 * The checkout is ../mivet-appfront by default; set MIVET_DIR to point at another
 * checkout or worktree (e.g. the branch that carries the oSign partner integration).
 */
import path from 'path'

export const MIVET_DIR = process.env.MIVET_DIR
  ? path.resolve(process.env.MIVET_DIR)
  : path.resolve(__dirname, '../../mivet-appfront')

/* eslint-disable @typescript-eslint/no-var-requires */
const clientMod = require(path.join(MIVET_DIR, 'lib/osign-client'))
const fieldsMod = require(path.join(MIVET_DIR, 'lib/esign-fields'))

export const OSignClient: any = clientMod.default ?? clientMod.OSignClient ?? clientMod
export const buildFieldsPayload: any = fieldsMod.buildFieldsPayload
export const filterContractsForView: any = fieldsMod.filterContractsForView
// Types only (erased at runtime).
export type ContractMapping = import('../../mivet-appfront/lib/esign-fields').ContractMapping
