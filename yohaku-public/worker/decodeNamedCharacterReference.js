import {characterEntities} from 'character-entities'

// Decode HTML entities without using document.createElement. This replacement
// is limited to the Worker bundle; the interactive reader keeps its normal build.
export function decodeNamedCharacterReference(name) {
  return Object.prototype.hasOwnProperty.call(characterEntities,name)?characterEntities[name]:false
}
