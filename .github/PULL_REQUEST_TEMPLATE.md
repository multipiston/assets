<!-- The rules are in CONTRIBUTING.md. CI computes every ref and finds rule violations. -->

**What changes:** new entry / presentation / retirement / family

- [ ] Not a duplicate: the catalog has no entry with the same meaning in other words
- [ ] `definition.domain` = the family's domain; `source` starts with `spec:`, `issuer:` or `registry:`; a crypto asset — CAIP-19 id, `spec:caip19`, `unit` = `atom`; a national currency — ISO 4217 code, `spec:iso4217`, `unit` = `minor-unit`
- [ ] Identifiers from outside standards are checked against their sources, and the source URL is in the entry's `note`
- [ ] `terms` hold only essential fixed conditions; typed terms use the `mp.*` keys
- [ ] Names and notes are in English
- [ ] A new asset has status `draft`; `listed` only with an answer to "who will trade this"
- [ ] Icon (if any): square `viewBox`, reads at 18 px on a dark background, rights confirmed
- [ ] For `issuer:<domain>` — the file `/.well-known/multipiston-assets.json` on the domain lists the token
- [ ] No keys, passwords, payment details or personal data
