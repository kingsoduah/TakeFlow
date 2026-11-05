// Header a shop's server sends its TakeFlow API key in.
export const API_KEY_HEADER = 'X-Api-Key';

// Keys look like tfk_<12 hex>_<48 hex>. The first part (tfk_ plus 12 hex) is
// the prefix: not secret, unique, used to find the key and to show it.
export const API_KEY_PREFIX = 'tfk_';
export const API_KEY_PATTERN = /^tfk_[0-9a-f]{12}_[0-9a-f]{48}$/;
export const API_KEY_PREFIX_LENGTH = 16;
