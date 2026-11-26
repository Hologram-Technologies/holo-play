# LexLean 1.2, as a Prism app uses it

This is the card prism-code holds to its models: every form here is one its fixtures use, and a test keeps each rule true of them. LexLean's vocabulary is closed, so a form that is not here is refused. A diagnostic carries its own code, its file and its line; fix what it names.

~~~text
LexLean, as a Prism app uses it. Every app starts from the canonical template: write the app in its model under app/src/, keeping each module's header lines as they are, and name each theorem that proves a capability in its row of model/ids.toml as Module.name.

Module: \begin{lexlean}{Name} … \begin{semanticmodule} … \end{semanticmodule} \end{lexlean}. A proofs module imports the model with \importmodule{Name} and refers to it as Name::thing.

Constant: definition{name: answerFree, parameters: [], result: Nat, body: 0}
Choices are Nat constants like this one: one per vehicle, answer or state.

Record: structure{name: Request, type_parameters: [], parameters: [], fields: [{name: hours, type: Nat}, {name: vehicle, type: Nat}]}

Function: definition{name: judge, parameters: [request : Request], result: Nat, body: (if ((project request hours) =? 0) then (answerFree) else (answerStandard))}
- A field: (project request hours). A call: (judge request), (Name::judge request) from another module.
- Comparisons give Bool: =? <? <=?   Logic: && || (not x)   Branch: (if c then a else b)
- Types: Nat, Int, Bool, Bytes, (Option Nat), (List Nat). Write Bool and Nat, never Boolean or Natural.
- Every compound expression is parenthesized, once: ((a && b)) is refused. A definition uses only definitions above it.
- Lists: (nil Nat), (cons head rest). Arithmetic: + and (prim multiply a b : Nat); (prim subtract a b : Nat), which stops at zero; (prim quotient a b 0 : Nat) and (prim remainder a b 0 : Nat), whose last argument is the answer for a zero divisor. There is no infix -, / or %: the first two are refused as terms, and a percent sign opens a TeX comment.
- A name for a value: (let name : Nat := (value); (body)). Chain them for several: (let a : Nat := (x + 1); (let b : Nat := (a + a); (b + 1))).
- Recursion matches on one argument and names it: body: (match fuel | Nat.zero => base | Nat.succ rest => (step rest)), recursive_argument: fuel. A list matches | List.nil => … | List.cons head rest => …, an option | Option.none => … | Option.some value => ….
- Bytes: (prim utf8_encode "text" : Bytes), (prim append left right : Bytes), and a byte as a number, (prim to_nat byte : Nat). Read them with (prim length value : Nat), (prim index value offset : (Option UInt8)) and (prim slice value start count : (Option Bytes)); compare with (prim equal left right : Bool).
- A number as text has no primitive: take each digit with (prim remainder n 10 0 : Nat) and (prim quotient n 10 0 : Nat), and its glyph with (prim slice (digitGlyphs) digit 1 : (Option Bytes)) from a constant "0123456789".
- A state the app keeps travels in each request and comes back in the answer, as text: the page sends it, the model answers the next one.
- An example is an acceptance vector, and reads as text: {request := (prim utf8_encode "e2e4" : Bytes), response := (prim utf8_encode "illegal move" : Bytes)}. No hex is needed.
- \title{…} is a phrase a lexicon defines, not free text: keep the title the module has.

Guarantee, in the proofs module (the model here is App): say what would break it, then prove that never happens.
definition{name: breaksFreeShort, parameters: [request : App::Request], result: Bool, body: (((project request hours) <=? 0) && (not ((App::judge request) =? (App::answerFree))))}
theorem{
  name: freeShort,
  parameters: [request : App::Request],
  statement: ((breaksFreeShort request) = false),
  proof: linear_arithmetic{definitions: [App::answerFree, App::answerStandard, App::judge, breaksFreeShort]},
  axioms: [Quot.sound, propext]
}
- definitions lists every definition the proof unfolds, the breaks definition included, without repeats, sorted as text: App::… before breaksFreeShort.
- A guarantee about every request bounds it: (((project request hours) <=? 24) && …) inside the breaks body.
- A guarantee of an app that keeps state is an invariant: one theorem that it holds in the initial state, and one per action that the action keeps it, given it held before.
- Declare axioms: [Quot.sound, propext]. A proof that needs fewer is still proved, and said.
- Lean's kernel proves linear_arithmetic, decide, reflexivity and simplify proofs here; any other proof kind is reported not proved.
- The proof search covers Nat parameters and records of them: where a theorem would take a Bool, give it a Nat, 1 or 0.

After every edit: npx prism-code check --json. It returns the first problem with the exact fix, or how many theorems Lean proved.
~~~
