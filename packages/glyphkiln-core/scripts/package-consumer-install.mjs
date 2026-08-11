export function packageConsumerInstallPlan(packageSpec, verifyPackageSignatures) {
  const installArguments = [
    "install",
    packageSpec,
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ];
  if (!verifyPackageSignatures) {
    installArguments.push("--package-lock=false");
  }

  return {
    installArguments,
    signatureAuditArguments: verifyPackageSignatures
      ? ["audit", "signatures"]
      : undefined,
  };
}
