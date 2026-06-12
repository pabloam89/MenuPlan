import { createContext } from "react";

// Progreso del onboarding (paso actual, total, salto). En fichero propio para
// que Onboarding.jsx solo exporte componentes (requisito de Fast Refresh).
export const OnboardingProgressContext = createContext(null);
