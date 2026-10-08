#!/usr/bin/env node
// La hora en Madrid, bien calculada: `npm run hora`. Ver scripts/lib/hora.mjs.
import { ahoraEnMadrid } from "./lib/hora.mjs";

console.log(ahoraEnMadrid());
