import { COMPANY } from "@/lib/legal";
import type { OperatorDetails, OperatorEnvironment } from "@/lib/operator.types";

function cleaned(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Who runs this Orbit, for the legal pages. Orbit is a product of Aionyx Technologies, so the
 * name and contact default to the company. Anyone running their own copy sets these variables to
 * their own details.
 */
export function readOperatorDetails(
  environment: OperatorEnvironment = process.env,
): OperatorDetails {
  return {
    name: cleaned(environment.ORBIT_OPERATOR_NAME) ?? COMPANY.name,
    contact: cleaned(environment.ORBIT_CONTACT_EMAIL) ?? COMPANY.email,
    dataLocation: cleaned(environment.ORBIT_DATA_LOCATION),
  };
}

export function hasOperatorDetails(details: OperatorDetails): boolean {
  return details.name !== null || details.contact !== null || details.dataLocation !== null;
}
