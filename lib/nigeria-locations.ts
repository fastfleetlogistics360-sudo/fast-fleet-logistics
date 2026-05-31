import {
  DEFAULT_LIVE_STATES,
  NIGERIAN_STATES,
  isOperationalLaunchStatus,
  normalizeState
} from "@/lib/launch-states";
import type { NigerianState } from "@/lib/launch-states";

export type LaunchStateRow = {
  state?: string | null;
  status?: string | null;
};

export const NIGERIAN_STATE_CITIES: Record<NigerianState, readonly string[]> = {
  Abia: ["Aba", "Umuahia", "Ohafia", "Arochukwu", "Bende"],
  Adamawa: ["Yola", "Jimeta", "Mubi", "Numan", "Ganye"],
  "Akwa Ibom": ["Uyo", "Eket", "Ikot Ekpene", "Oron", "Abak"],
  Anambra: ["Awka", "Onitsha", "Nnewi", "Ekwulobia", "Ihiala"],
  Bauchi: ["Bauchi", "Azare", "Misau", "Jama'are", "Katagum"],
  Bayelsa: ["Yenagoa", "Brass", "Ogbia", "Nembe", "Sagbama"],
  Benue: ["Makurdi", "Gboko", "Otukpo", "Katsina-Ala", "Vandeikya"],
  Borno: ["Maiduguri", "Biu", "Monguno", "Bama", "Konduga"],
  "Cross River": ["Calabar", "Ugep", "Ikom", "Obudu", "Ogoja"],
  Delta: ["Asaba", "Warri", "Sapele", "Ughelli", "Agbor", "Oleh"],
  Ebonyi: ["Abakaliki", "Afikpo", "Onueke", "Nkalagu", "Ezza"],
  Edo: ["Benin City", "Auchi", "Ekpoma", "Uromi", "Irrua"],
  Ekiti: ["Ado-Ekiti", "Ikere-Ekiti", "Ijero-Ekiti", "Ikole-Ekiti", "Oye-Ekiti"],
  Enugu: ["Enugu", "Nsukka", "Agbani", "Udi", "Oji River"],
  "Federal Capital Territory": ["Abuja", "Garki", "Wuse", "Maitama", "Gwarinpa", "Kubwa", "Lugbe", "Kuje", "Gwagwalada", "Bwari"],
  Gombe: ["Gombe", "Kaltungo", "Billiri", "Dukku", "Bajoga"],
  Imo: ["Owerri", "Orlu", "Okigwe", "Mbaise", "Oguta"],
  Jigawa: ["Dutse", "Hadejia", "Gumel", "Kazaure", "Ringim"],
  Kaduna: ["Kaduna", "Zaria", "Kafanchan", "Kagoro", "Saminaka"],
  Kano: ["Kano", "Wudil", "Bichi", "Gwarzo", "Rano"],
  Katsina: ["Katsina", "Daura", "Funtua", "Malumfashi", "Dutsin-Ma"],
  Kebbi: ["Birnin Kebbi", "Argungu", "Yauri", "Zuru", "Jega"],
  Kogi: ["Lokoja", "Okene", "Kabba", "Idah", "Anyigba"],
  Kwara: ["Ilorin", "Offa", "Omu-Aran", "Lafiagi", "Patigi"],
  Lagos: [
    "Agege",
    "Ajeromi-Ifelodun",
    "Alimosho",
    "Amuwo-Odofin",
    "Apapa",
    "Badagry",
    "Epe",
    "Eti-Osa",
    "Ibeju-Lekki",
    "Ifako-Ijaiye",
    "Ikeja",
    "Ikorodu",
    "Kosofe",
    "Lagos Island",
    "Lagos Mainland",
    "Mushin",
    "Ojo",
    "Oshodi-Isolo",
    "Shomolu",
    "Surulere"
  ],
  Nasarawa: ["Lafia", "Keffi", "Akwanga", "Karu", "Nasarawa", "Doma"],
  Niger: ["Minna", "Bida", "Suleja", "Kontagora", "Lapai", "Mokwa"],
  Ogun: ["Abeokuta North", "Abeokuta South", "Ado-Odo/Ota", "Ewekoro", "Ifo", "Ijebu Ode", "Obafemi Owode", "Sagamu", "Yewa North", "Yewa South"],
  Ondo: ["Akure", "Ondo", "Owo", "Ikare", "Okitipupa", "Ore"],
  Osun: ["Osogbo", "Ile-Ife", "Ilesa", "Ede", "Ikirun", "Iwo"],
  Oyo: ["Ibadan", "Ogbomoso", "Oyo", "Iseyin", "Saki", "Eruwa"],
  Plateau: ["Jos", "Bukuru", "Pankshin", "Shendam", "Langtang", "Mangu"],
  Rivers: ["Port Harcourt", "Obio-Akpor", "Bonny", "Ahoada", "Bori", "Omoku"],
  Sokoto: ["Sokoto", "Tambuwal", "Wurno", "Gwadabawa", "Illela"],
  Taraba: ["Jalingo", "Wukari", "Bali", "Takum", "Gembu"],
  Yobe: ["Damaturu", "Potiskum", "Gashua", "Nguru", "Geidam"],
  Zamfara: ["Gusau", "Kaura Namoda", "Talata Mafara", "Anka", "Shinkafi"]
};

export function isNigerianState(value: string): value is NigerianState {
  return NIGERIAN_STATES.includes(value as NigerianState);
}

export function normalizeStateList(states: readonly (string | null | undefined)[]) {
  const selected = new Set<NigerianState>();
  states.forEach((value) => {
    const state = normalizeState(value);
    if (isNigerianState(state)) selected.add(state);
  });
  return NIGERIAN_STATES.filter((state) => selected.has(state));
}

export function activeStatesFromLaunchRows(rows: readonly LaunchStateRow[] | null | undefined) {
  return normalizeStateList((rows || []).filter((row) => isOperationalLaunchStatus(row.status)).map((row) => row.state));
}

export function operationLocationsForStates(states: readonly (string | null | undefined)[]) {
  const normalizedStates = normalizeStateList(states);
  const statesToUse: NigerianState[] = normalizedStates.length ? normalizedStates : [...DEFAULT_LIVE_STATES];
  return statesToUse.flatMap((state) => NIGERIAN_STATE_CITIES[state].map((city) => `${city}, ${state}`));
}

export function operationLocationsForLaunchRows(rows: readonly LaunchStateRow[] | null | undefined) {
  return operationLocationsForStates(activeStatesFromLaunchRows(rows));
}

export const DEFAULT_OPERATION_LOCATIONS = operationLocationsForStates(DEFAULT_LIVE_STATES);
