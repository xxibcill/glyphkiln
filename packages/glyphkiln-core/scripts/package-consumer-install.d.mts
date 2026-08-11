export interface PackageConsumerInstallPlan {
  installArguments: string[];
  signatureAuditArguments: ["audit", "signatures"] | undefined;
}

export declare function packageConsumerInstallPlan(
  packageSpec: string,
  verifyPackageSignatures: boolean,
): PackageConsumerInstallPlan;
