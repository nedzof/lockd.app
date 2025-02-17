export const PROTOCOLS = {
  MAP: '6d',         // MAP protocol identifier
  ORD: '0063036f72', // Ordinals protocol identifier
  BITCOM: '626974'   // Bitcom protocol identifier
} as const;

export const SCRIPT_TYPES = {
  NULLDATA: 'nulldata',
  PUBKEYHASH: 'pubkeyhash',
  MULTISIG: 'multisig'
} as const;
