/**
 * Ei vanleg, heil e-postadresse: bokstavar, tal og . _ + - før krøllalfaen, og
 * eit domene med minst eitt punktum og eit toppdomene på bokstavar.
 *
 * Strengare enn standarden med vilje. Adressa blir mottakar hos Resend og
 * nøkkel for taka per adresse, så «Namn <adresse>», vinkelparentesar, komma og
 * doble eller avsluttande punktum skal ikkje sleppe gjennom: dei ville nådd same
 * postkasse som ei anna adresse og telt som ei ny.
 *
 * Same mønster står i pipe_submit_pickup_order. Endrar du det eine, endrar du
 * det andre.
 */
export const GYLDIG_EPOST =
  /^[A-Za-z0-9_+-]+(?:\.[A-Za-z0-9_+-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

export const gyldigEpost = (s: string | null | undefined): boolean =>
  !!s && s.length <= 254 && GYLDIG_EPOST.test(s);
