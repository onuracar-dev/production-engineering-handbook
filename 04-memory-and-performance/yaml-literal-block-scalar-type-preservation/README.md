# Case Study 66: Literal Block Scalar Type Inference Defense in YAML Deserialization

---

## 1. Problem

1. **YAML 1.2 Specification Violation:** Under the YAML 1.2 specification, literal block scalars (denoted by the pipe symbol `|` or `|-`) represent formatted text blocks and must strictly be treated as strings.
2. **Unintended Type Coercion:** When deserializing dynamic YAML documents with `WithAttemptingUnquotedStringTypeDeserialization`, block scalars containing values like `true`, `false`, `null`, or numbers were erroneously converted into C# booleans, null references, or integers.
3. **Data Loss in Multiline Configuration:** Configuration templates containing scripts, certificates, or text blocks lost formatting and type integrity when parsed as dynamic dictionaries.

---

## 2. Why Naive Approaches Fail

1. **Exclusionary Style Whitelisting:** Checking `value.Style == SingleQuoted || DoubleQuoted || Folded` forgot `ScalarStyle.Literal`.
2. **Post-Deserialization String Casting:** Forcing callers to cast objects back to strings fails if the parser has already mutated `"true"` into boolean `true` or `"null"` into an empty reference.
3. **Disabling Type Inference Globally:** Turning off type deserialization breaks expected parsing of unquoted numbers and booleans across the rest of the document.

---

## 3. Architecture

1. **Inversion to Plain-Scalar Filtering (`value.Style != ScalarStyle.Plain`):** In `ScalarNodeDeserializer.cs`, the condition was inverted. Type inference is strictly restricted to plain scalars. Any scalar with explicit formatting (quoted, folded, or literal block) is preserved directly as a string.
2. **Comprehensive Theory Tests:** Validated via xUnit `[Theory]` test cases testing empty blocks (`Value: |-`), boolean-like blocks (`Value: |-\n  true`), null blocks, and numeric blocks.
3. **Single Comparison Instruction:** Eliminates multiple style equality checks by executing a single inequality comparison (`value.Style != ScalarStyle.Plain`).

---

## 4. Behavior Comparison

| YAML Deserialization Strategy | Literal Block Scalar (`Value: \|-\n true`) | Plain Scalar (`Value: true`) | Spec Conformance |
|---|---|---|---|
| Incomplete Whitelist | Coerced to `Boolean(true)` | `Boolean(true)` | Violates YAML 1.2 |
| Disable Type Inference | `String("true")` | Coerced to `String` (Lost Types) | Partial |
| **Strict Plain-Only Check (`!= Plain`)** | **`String("true")` (Preserved)** | **`Boolean(true)` (Preserved)** | **Preserves scalar style per YAML 1.2** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/yaml_scalar_deserializer.cs`](./src/yaml_scalar_deserializer.cs).

---

## 6. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
