import { IBusinessEdition } from "./types";
import ceBusiness from "../ce/business";

/**
 * Resolves the active edition implementation.
 *
 * Defaults to EE (this code lives in the private superset repo, which ships Business features).
 * Set `EDITION=ce` to force the open-core build. The open-core repo additionally has `src/ee`
 * stripped, so even if EDITION is unset there the dynamic require fails and we fall back to CE.
 * The CE contract is imported statically and is the only implementation shipped publicly.
 */
function resolveBusinessEdition(): IBusinessEdition {
  if (process.env.EDITION === "ce") {
    return ceBusiness;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const eeBusiness: IBusinessEdition = require("../ee/business").default;
    return eeBusiness;
  } catch (err) {
    if (
      typeof err !== "object" ||
      err === null ||
      !("message" in err) ||
      !String(err.message).includes("Cannot find module '../ee/business'")
    ) {
      throw err;
    }

    // eslint-disable-next-line no-console
    console.warn("[edition] EE implementation unavailable; running open-core (CE).");
    return ceBusiness;
  }
}

const business: IBusinessEdition = resolveBusinessEdition();

export default business;
