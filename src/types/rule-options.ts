/**
 * Rule-specific analysis options supplied by policy.
 */

export interface LargeModuleRuleOptions {
  maxLines?: number;
  maxFunctions?: number;
  maxSizeKB?: number;
}

export interface RuleOptionsConfig {
  LARGE_MODULE?: LargeModuleRuleOptions;
}
