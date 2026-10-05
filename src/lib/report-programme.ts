/**
 * What the programme d'analyse changes on the report (PROGRAMME.md §6).
 *
 * Pure, so the report builder and the tests read the same rules:
 * - « Analyses réalisées par » names every technician of the line — the
 *   sample's and each parameter's — once each, separated by « · »;
 * - the « Méthode » column prints the norm version programmed for the
 *   parameter, else the one of the criterion the result was judged under,
 *   else the parameter's own.
 */

export const TECHNICIAN_SEPARATOR = " · ";

type Named = { name: string } | null | undefined;

/**
 * The distinct technicians of a line, the sample's first, then each
 * parameter's in programme order — or null when nobody is named.
 */
export function reportTechnicianNames(sample: {
  technician: Named;
  parameters: { technician: Named }[];
}): string | null {
  const names: string[] = [];
  const push = (who: Named) => {
    const name = who?.name?.trim();
    if (name && !names.includes(name)) names.push(name);
  };
  push(sample.technician);
  for (const parameter of sample.parameters) push(parameter.technician);
  return names.length > 0 ? names.join(TECHNICIAN_SEPARATOR) : null;
}

/** The method printed for one result: programmed, else the criterion's, else the parameter's. */
export function reportMethod(
  programmed: string | null | undefined,
  criterion: string | null | undefined,
  parameter: string | null | undefined
): string | null {
  return programmed || criterion || parameter || null;
}
