// Regnestykket bur i supabase/functions/_shared, fordi e-postfunksjonen òg
// treng det. Appen hentar det her, så ingen komponent treng å kjenne den stien.
export * from "../../supabase/functions/_shared/mva";
