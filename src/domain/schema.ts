import { z } from "zod";
import { validAddress } from "./address.ts";
import {
  ATTEMPT_ERROR_CLASSES,
  NETWORKS,
  SETTINGS,
  STATUS_LABELS,
} from "../config.ts";
const decimal = z.string().regex(/^(0|[1-9]\d*)$/);
const address = z.string().refine(validAddress, "地址无效");
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const text = z.string().max(SETTINGS.maxTextLength);
export const recordSchema = z
  .object({
    schemaVersion: z.literal(1),
    localId: text.min(1),
    activityName: text,
    createdAt: z.iso.datetime(),
    status: z.enum(
      Object.keys(STATUS_LABELS) as [
        keyof typeof STATUS_LABELS,
        ...(keyof typeof STATUS_LABELS)[],
      ],
    ),
    snapshot: z
      .object({
        payer: address,
        contractAddress: address,
        chainId: z
          .number()
          .int()
          .positive()
          .safe()
          .refine(
            (id) =>
              Object.values(NETWORKS).some((network) => network.id === id),
            "不支持此备份网络",
          ),
        batchId: hash,
        payloadHash: hash,
        totalNative: decimal,
        recipients: z
          .array(
            z
              .object({
                sourceRow: z.number().int().positive(),
                address,
                amount: text,
                amountNative: decimal,
                recipientIndex: z.number().int().nonnegative(),
                label: text,
              })
              .strict(),
          )
          .min(1),
      })
      .strict(),
    attempts: z.array(
      z
        .object({
          id: text.min(1),
          requestedAt: z.iso.datetime(),
          originalHash: hash.optional(),
          currentHash: hash.optional(),
          nonce: z.number().int().nonnegative().safe().optional(),
          replacements: z.array(
            z
              .object({
                oldHash: hash,
                newHash: hash,
                reason: z.enum(["repriced", "replaced", "cancelled"]),
              })
              .strict(),
          ),
          error: z.string().max(SETTINGS.maxFileBytes).optional(),
          errorClass: z.enum(ATTEMPT_ERROR_CLASSES).optional(),
          receipt: z
            .object({
              transactionHash: hash,
              blockNumber: decimal,
              gasUsed: decimal,
              effectiveGasPrice: decimal,
              status: z.enum(["success", "reverted"]),
            })
            .strict()
            .optional(),
        })
        .strict(),
    ),
    preflightBlock: decimal.optional(),
    evidence: z
      .object({
        transactionHash: hash,
        blockNumber: decimal,
        gasUsed: decimal,
        effectiveGasPrice: decimal,
      })
      .strict()
      .optional(),
  })
  .strict();
export const backupSchema = z
  .object({ schemaVersion: z.literal(1), records: z.array(recordSchema) })
  .strict();
export const deploymentSchema = z
  .object({
    chainId: z.number().int().positive().safe(),
    contractAddress: address,
    deploymentBlock: decimal,
    transactionHash: hash,
    maxRecipients: decimal.refine(
      (s) => BigInt(s) > 0n && BigInt(s) <= BigInt(Number.MAX_SAFE_INTEGER),
    ),
    version: text.min(1),
    compiler: text.min(1),
    evmVersion: text.min(1),
    sourceHash: hash,
    runtimeCodeHash: hash,
    abiSource: text.min(1),
  })
  .strict();
