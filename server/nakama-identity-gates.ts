import { BLOCKED_IDENTITY_HOOKS } from '../shared/nakama-contracts.ts';
/** Check the generated native registration manifest against the pinned server API. */
export const identityHooks =
  BLOCKED_IDENTITY_HOOKS satisfies readonly (keyof nkruntime.Initializer)[];
/** Only immutable captain/password identity is supported; no generic account-linking bypass. */
export function denyUnsupportedIdentity(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _request: unknown,
): never {
  throw {
    code: 7,
    message:
      'Captain identities cannot be linked, unlinked or authenticated through another provider.',
  };
}
