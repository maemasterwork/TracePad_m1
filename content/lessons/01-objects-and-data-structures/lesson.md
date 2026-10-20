# Python Object and Data Structure Basics

> A complete, hands-on course module covering Python's core built-in types and data structures: numbers, variables, strings, formatting, lists, dictionaries, tuples, sets, booleans, and files.

**Level:** Beginner → Lower-Intermediate
**Requirements:** Python 3.10+ (examples use f-strings and modern syntax)
**Estimated time:** 12–16 hours (reading + practice + homework)

---

## Table of Contents

1. [Numbers](#1-numbers)
2. [Variable Assignment](#2-variable-assignment)
3. [Strings](#3-strings)
4. [Print Formatting with Strings](#4-print-formatting-with-strings)
5. [Lists](#5-lists)
6. [Dictionaries](#6-dictionaries)
7. [Tuples](#7-tuples)
8. [Sets and Booleans](#8-sets-and-booleans)
9. [Files](#9-files)
10. [Objects and Data Structures Assessment Test](#10-objects-and-data-structures-assessment-test)
11. [Appendix: Cheat Sheet, Common Mistakes, Final Project](#11-appendix)

> **How to use this document:** Type every example yourself (do not copy-paste), predict the output *before* running, then do the **Try It** exercises and the **Homework** at the end of each chapter. Solutions to the assessment are at the end.

---

## 1. Numbers

### 1.1 Learning goals
- Distinguish `int`, `float`, and `complex`
- Use arithmetic operators and understand operator precedence
- Use built-in numeric functions and the `math` module
- Understand floating-point precision and how to handle it

### 1.2 Number types

| Type | Example | Description |
|---|---|---|
| `int` | `3`, `-42`, `1_000_000` | Whole numbers, unlimited size |
| `float` | `3.14`, `-0.5`, `2e3` | Decimal numbers (about 15–16 digits of precision) |
| `complex` | `2 + 3j` | Real + imaginary part (rarely needed for beginners) |

```python
print(type(7))        # <class 'int'>
print(type(7.0))      # <class 'float'>
print(type(2 + 3j))   # <class 'complex'>

big = 10 ** 100       # Python ints never overflow
print(big)

population = 8_100_000_000   # underscores improve readability
print(population)
```

### 1.3 Arithmetic operators

| Operator | Meaning | Example | Result |
|---|---|---|---|
| `+` | Addition | `7 + 3` | `10` |
| `-` | Subtraction | `7 - 3` | `4` |
| `*` | Multiplication | `7 * 3` | `21` |
| `/` | True division (always `float`) | `7 / 2` | `3.5` |
| `//` | Floor division | `7 // 2` | `3` |
| `%` | Modulo (remainder) | `7 % 2` | `1` |
| `**` | Power | `2 ** 10` | `1024` |

```python
print(7 / 2)      # 3.5
print(7 // 2)     # 3
print(-7 // 2)    # -4   (floors toward negative infinity!)
print(7 % 2)      # 1
print(2 ** 0.5)   # 1.4142135623730951 (square root)
print(divmod(17, 5))   # (3, 2) -> quotient and remainder at once
```

**Operator precedence** (highest → lowest): `**`, unary `-`, `* / // %`, `+ -`. Use parentheses to be explicit.

```python
print(2 + 3 * 4)       # 14
print((2 + 3) * 4)     # 20
print(-2 ** 2)         # -4  (power binds tighter than unary minus)
print((-2) ** 2)       # 4
```

### 1.4 Useful built-in functions

```python
print(abs(-12.5))          # 12.5
print(round(3.14159, 2))   # 3.14
print(round(2.5))          # 2   (banker's rounding: ties go to the even number)
print(round(3.5))          # 4
print(pow(2, 5))           # 32
print(min(4, 9, 1), max(4, 9, 1))   # 1 9
print(sum([1, 2, 3, 4]))   # 10
print(int(7.9))            # 7   (truncates, does NOT round)
print(float("3.5"))        # 3.5
print(int("42"))           # 42
```

### 1.5 The `math` module

```python
import math

print(math.sqrt(144))     # 12.0
print(math.ceil(4.1))     # 5
print(math.floor(4.9))    # 4
print(math.pi)            # 3.141592653589793
print(math.factorial(5))  # 120
print(math.gcd(12, 18))   # 6
print(math.log10(1000))   # 3.0
print(math.isclose(0.1 + 0.2, 0.3))   # True
```

### 1.6 Floating-point surprise

```python
print(0.1 + 0.2)            # 0.30000000000000004
print(0.1 + 0.2 == 0.3)     # False  <-- !!!
```

Computers store floats in binary, so some decimals cannot be represented exactly. **Never compare floats with `==`**; use `math.isclose()`. For money, use `decimal`:

```python
from decimal import Decimal

print(Decimal("0.1") + Decimal("0.2"))                      # 0.3
print(Decimal("0.1") + Decimal("0.2") == Decimal("0.3"))    # True
```

### 1.7 Practical examples

**Example 1 – Tip & bill splitter**

```python
bill = 86.50
tip_percent = 15
people = 4

tip = bill * tip_percent / 100
total = bill + tip
per_person = total / people

print(f"Tip:        {tip:.2f}")
print(f"Total:      {total:.2f}")
print(f"Per person: {per_person:.2f}")
```

**Example 2 – Seconds → hours:minutes:seconds** (uses `//` and `%`)

```python
total_seconds = 98_765

hours = total_seconds // 3600
minutes = (total_seconds % 3600) // 60
seconds = total_seconds % 60

print(f"{hours:02d}:{minutes:02d}:{seconds:02d}")   # 27:26:05
```

**Example 3 – BMI calculator**

```python
weight_kg = 72
height_m = 1.78
bmi = weight_kg / height_m ** 2
print(f"BMI = {bmi:.1f}")   # BMI = 22.7
```

**Example 4 – Is the number even? (modulo trick)**

```python
n = 48
print(n % 2 == 0)   # True
```

### 1.8 Try It
1. Compute the area and circumference of a circle with radius `7.5` using `math.pi`.
2. Convert `100` degrees Fahrenheit to Celsius: `C = (F - 32) * 5 / 9`.
3. Predict, then check: `print(10 / 3, 10 // 3, 10 % 3, -10 // 3, -10 % 3)`.
4. Why does `round(0.5)` give `0` while `round(1.5)` gives `2`?

### 1.9 Homework – Chapter 1
1. **Compound interest:** `A = P * (1 + r/n) ** (n*t)`. Compute the final amount for P = 10,000, r = 5%, n = 12, t = 10. Print with 2 decimals.
2. **Change maker:** Given an amount in cents (e.g., `387`), compute how many quarters (25), dimes (10), nickels (5), and pennies (1) are needed using `//` and `%`.
3. **Digit sum:** Given a 4-digit integer like `4729`, extract each digit using only `//` and `%` and print their sum. (No strings allowed!)
4. **Distance:** Given two points `(x1, y1)` and `(x2, y2)`, compute their Euclidean distance.

---

## 2. Variable Assignment

### 2.1 Learning goals
- Create and reassign variables
- Follow Python naming rules and conventions
- Understand dynamic typing and object references
- Use multiple assignment, swapping, and augmented assignment

### 2.2 What is a variable?
A variable is a **name that refers to an object** in memory. In Python, `=` does not "put a value in a box"; it **binds a name to an object**.

```python
x = 10
print(x)          # 10
print(type(x))    # <class 'int'>
```

### 2.3 Dynamic typing
Python figures out types at runtime; the same name can be re-bound to a different type.

```python
x = 10          # int
x = "hello"     # now str
x = [1, 2, 3]   # now list
print(type(x))  # <class 'list'>
```

### 2.4 Naming rules

- Letters, digits, underscores only; **cannot start with a digit**
- Case-sensitive (`age` ≠ `Age`)
- Cannot be a keyword (`if`, `for`, `class`, `None`, ...)

```python
user_name = "Sara"     # good: snake_case (PEP 8)
_total = 0             # allowed (leading underscore = "internal use" by convention)
MAX_USERS = 100        # CONSTANT by convention (not enforced)

# 2nd_place = "Ali"    # SyntaxError: starts with digit
# my-var = 5           # SyntaxError: hyphen not allowed
# class = "A"          # SyntaxError: keyword
```

Good names describe meaning: `student_count`, not `sc`; `price_after_tax`, not `x2`.

### 2.4.1 Avoid shadowing built-ins
```python
list = [1, 2, 3]       # BAD: now you can't call list() anymore!
# list("abc")          # TypeError: 'list' object is not callable
```
Use `items`, `numbers`, `data_list`, etc.

### 2.5 Multiple assignment & swapping

```python
a, b, c = 1, 2, 3          # tuple unpacking
x = y = z = 0              # same value to several names

a, b = b, a                # swap without a temp variable
print(a, b)                # 2 1
```

### 2.6 Augmented assignment

```python
score = 10
score += 5     # 15
score -= 3     # 12
score *= 2     # 24
score //= 5    # 4
score **= 2    # 16
print(score)
```

### 2.7 Identity, references, and mutability (preview)

```python
a = [1, 2, 3]
b = a            # b refers to the SAME list
b.append(4)
print(a)         # [1, 2, 3, 4]  <-- a changed too!
print(a is b)    # True
print(id(a) == id(b))   # True

c = a.copy()     # a real, independent copy
c.append(5)
print(a)         # [1, 2, 3, 4]
print(c)         # [1, 2, 3, 4, 5]
```

| Immutable (cannot change in place) | Mutable (can change in place) |
|---|---|
| `int`, `float`, `bool`, `str`, `tuple`, `frozenset` | `list`, `dict`, `set` |

### 2.8 Practical examples

**Example 1 – Swap two players' scores**
```python
alice, bob = 82, 95
alice, bob = bob, alice
print(f"Alice={alice}, Bob={bob}")   # Alice=95, Bob=82
```

**Example 2 – Running total (augmented assignment)**
```python
total = 0
for price in [12.5, 8.0, 3.25]:
    total += price
print(total)   # 23.75
```

**Example 3 – Fibonacci with simultaneous assignment**
```python
a, b = 0, 1
for _ in range(10):
    print(a, end=" ")
    a, b = b, a + b
# 0 1 1 2 3 5 8 13 21 34
```

**Example 4 – Constants and configuration**
```python
TAX_RATE = 0.09
SHIPPING_FEE = 4.99

subtotal = 120
total = subtotal * (1 + TAX_RATE) + SHIPPING_FEE
print(round(total, 2))   # 135.79
```

### 2.9 Try It
1. Which of these are valid names? `total_2`, `2total`, `my var`, `_x`, `for`, `Name`, `first-name`.
2. Predict the output:
   ```python
   a = 5
   b = a
   a = 10
   print(a, b)
   ```
   Why is the result different from the list example in 2.7?
3. Use `type()` to inspect: `5`, `5.0`, `"5"`, `True`, `None`, `[5]`, `(5,)`, `{5}`, `{"a": 5}`.

### 2.10 Homework – Chapter 2
1. Without a third variable, swap three variables `a, b, c` so that `a←b`, `b←c`, `c←a` in one line.
2. A phone costs `799`. Using variables and augmented assignment, apply: 10 % discount, then add 9 % tax. Print the final price.
3. Explain (in 3–4 sentences, as a code comment) why `b = a` followed by `b.append(...)` changes `a` for lists but `b = a; b += 1` doesn't change `a` for ints.
4. Create variables for your name, age, height, and a boolean `is_student`. Print each with its type.

---

## 3. Strings

### 3.1 Learning goals
- Create strings with various quote styles and escapes
- Index and slice strings
- Use essential string methods
- Understand string immutability

### 3.2 Creating strings

```python
s1 = 'single quotes'
s2 = "double quotes"
s3 = "It's easy to include an apostrophe"
s4 = 'He said "hi"'
s5 = """Triple quotes
can span
multiple lines."""
empty = ""

print(len(s2))      # 13
```

**Escape sequences**

| Sequence | Meaning |
|---|---|
| `\n` | New line |
| `\t` | Tab |
| `\\` | Backslash |
| `\'` `\"` | Quotes |

```python
print("Line1\nLine2")
print("Name\tAge")
print("C:\\Users\\Ali")
print(r"C:\Users\Ali")    # raw string: backslashes are literal
```

### 3.3 Indexing and slicing

```
 P  y  t  h  o  n
 0  1  2  3  4  5      (positive index)
-6 -5 -4 -3 -2 -1      (negative index)
```

```python
word = "Python"
print(word[0])      # P
print(word[-1])     # n
print(word[1:4])    # yth   (start inclusive, stop exclusive)
print(word[:2])     # Py
print(word[2:])     # thon
print(word[::2])    # Pto   (every 2nd char)
print(word[::-1])   # nohtyP (reversed)
```

Slice syntax: `s[start:stop:step]`.

### 3.4 Immutability

```python
name = "Python"
# name[0] = "J"      # TypeError: 'str' object does not support item assignment
name = "J" + name[1:]
print(name)          # Jython
```

### 3.5 Concatenation, repetition, membership

```python
first, last = "Ada", "Lovelace"
print(first + " " + last)     # Ada Lovelace
print("ha" * 3)               # hahaha
print("-" * 30)               # divider line
print("love" in last)         # True? -> "Lovelace" contains "love"? No (case!) -> False
print("love" in last.lower()) # True
```

### 3.6 Essential methods

| Method | Purpose | Example → Result |
|---|---|---|
| `lower()`, `upper()` | Case change | `"Hi".upper()` → `"HI"` |
| `title()`, `capitalize()` | Case style | `"hello world".title()` → `"Hello World"` |
| `strip()`, `lstrip()`, `rstrip()` | Remove whitespace | `"  hi ".strip()` → `"hi"` |
| `split(sep)` | String → list | `"a,b,c".split(",")` → `['a','b','c']` |
| `join(list)` | List → string | `"-".join(["a","b"])` → `"a-b"` |
| `replace(old, new)` | Replace text | `"cat".replace("c","b")` → `"bat"` |
| `find(sub)` | Index or `-1` | `"hello".find("l")` → `2` |
| `index(sub)` | Index or error | `"hello".index("l")` → `2` |
| `count(sub)` | Occurrences | `"banana".count("a")` → `3` |
| `startswith()`, `endswith()` | Test ends | `"file.py".endswith(".py")` → `True` |
| `isdigit()`, `isalpha()`, `isalnum()` | Content tests | `"123".isdigit()` → `True` |
| `zfill(n)` | Zero-pad | `"7".zfill(3)` → `"007"` |
| `center(w, ch)` | Center text | `"hi".center(6, "*")` → `"**hi**"` |

```python
text = "  The quick brown fox  "
clean = text.strip()
words = clean.split()
print(words)                    # ['The', 'quick', 'brown', 'fox']
print(" ".join(reversed(words)))# fox brown quick The
print(clean.replace(" ", "_"))  # The_quick_brown_fox
print(clean.upper())
print(clean.count("o"))         # 2
```

Methods **return new strings**; the original is unchanged.

### 3.7 Practical examples

**Example 1 – Username generator**
```python
full_name = "  Maryam Karimi  "
first, last = full_name.strip().lower().split()
username = f"{first[0]}.{last}"
print(username)   # m.karimi
```

**Example 2 – Palindrome checker**
```python
def is_palindrome(text):
    cleaned = "".join(ch.lower() for ch in text if ch.isalnum())
    return cleaned == cleaned[::-1]

print(is_palindrome("A man, a plan, a canal: Panama"))  # True
print(is_palindrome("Python"))                          # False
```

**Example 3 – Email validator (simple)**
```python
email = "student@example.com"
valid = ("@" in email
         and email.count("@") == 1
         and email.endswith((".com", ".org", ".net")))
print(valid)   # True
```

**Example 4 – Vowel counter**
```python
sentence = "Programming is fun"
vowels = sum(1 for ch in sentence.lower() if ch in "aeiou")
print(vowels)   # 5
```

**Example 5 – Caesar cipher (shift 3)**
```python
def caesar(text, shift=3):
    result = ""
    for ch in text:
        if ch.isalpha():
            base = ord("A") if ch.isupper() else ord("a")
            result += chr((ord(ch) - base + shift) % 26 + base)
        else:
            result += ch
    return result

secret = caesar("Hello, World!")
print(secret)             # Khoor, Zruog!
print(caesar(secret, -3)) # Hello, World!
```

### 3.8 Try It
1. Given `s = "Hello, World"`, produce `"dlroW ,olleH"`, `"Hlo ol"`, and `"World"` using slices only.
2. Why does `"abc" * 2 + "d" * 0` produce `"abcabc"`?
3. What is the difference between `find()` and `index()` when the substring is missing?
4. Strip, then title-case: `"   pYtHoN   pRoGrAmMiNg  "`.

### 3.9 Homework – Chapter 3
1. **Password strength:** Given a password string, report whether it has ≥ 8 characters, at least one digit, one uppercase letter, and one lowercase letter.
2. **Word counter:** Ask for a sentence (with `input()`), then print the number of words, the longest word, and the sentence with each word capitalized.
3. **Anagram test:** Write `is_anagram(a, b)` that ignores case and spaces.
4. **Initials:** `"john ronald reuel tolkien"` → `"J.R.R.T."`.
5. **Mask card:** Given `"6037991234567890"`, print `"************7890"`.

---

## 4. Print Formatting with Strings

### 4.1 Learning goals
- Control `print()` output (`sep`, `end`)
- Use **f-strings**, `str.format()`, and `%` formatting
- Align text, set widths/precision, format numbers

### 4.2 `print()` options

```python
print("a", "b", "c")                # a b c
print("a", "b", "c", sep="-")       # a-b-c
print("Loading", end="...")         # no newline
print("done")                       # Loading...done
print("Tab\tseparated")
```

### 4.3 f-strings (recommended)

```python
name = "Sara"
age = 24
print(f"My name is {name} and I am {age}.")
print(f"Next year I'll be {age + 1}.")
print(f"{name.upper()} has {len(name)} letters.")
print(f"{name=}")                   # name='Sara'  (handy for debugging)
```

### 4.4 The format mini-language: `{value:format_spec}`

General shape: `{value:[fill][align][sign][width][,][.precision][type]}`

| Spec | Meaning | Example | Output |
|---|---|---|---|
| `.2f` | 2 decimals | `f"{3.14159:.2f}"` | `3.14` |
| `,` | Thousands separator | `f"{1234567:,}"` | `1,234,567` |
| `.1%` | Percent | `f"{0.256:.1%}"` | `25.6%` |
| `>10` | Right-align in 10 | `f"{'hi':>10}"` | `        hi` |
| `<10` | Left-align | `f"{'hi':<10}|"` | `hi        |` |
| `^10` | Center | `f"{'hi':^10}"` | `    hi    ` |
| `*^10` | Fill with `*` | `f"{'hi':*^10}"` | `****hi****` |
| `05d` | Zero-pad | `f"{42:05d}"` | `00042` |
| `b`, `o`, `x` | Binary/octal/hex | `f"{255:b} {255:o} {255:x}"` | `11111111 377 ff` |
| `e` | Scientific | `f"{12345.678:.2e}"` | `1.23e+04` |
| `+` | Show sign | `f"{5:+d}"` | `+5` |

```python
price = 1234.5
print(f"Price: ${price:,.2f}")       # Price: $1,234.50
print(f"Width: [{price:>12,.2f}]")   # Width: [    1,234.50]

width, precision = 10, 3
value = 3.14159265
print(f"{value:{width}.{precision}f}")   # '     3.142' (nested fields)
```

### 4.5 `str.format()` (older, still common)

```python
print("{} is {} years old".format("Ali", 30))
print("{1} before {0}".format("B", "A"))                 # A before B
print("{name} scored {score:.1f}".format(name="Ali", score=18.456))
```

### 4.6 `%` formatting (legacy – recognize it, avoid it)

```python
print("%s is %d years old" % ("Ali", 30))
print("Pi is about %.2f" % 3.14159)
```

### 4.7 Practical examples

**Example 1 – Receipt printer**
```python
items = [("Notebook", 3, 2.50), ("Pen", 10, 0.80), ("Backpack", 1, 34.99)]

print(f"{'Item':<12}{'Qty':>5}{'Price':>10}{'Total':>10}")
print("-" * 37)
grand_total = 0
for name, qty, price in items:
    line_total = qty * price
    grand_total += line_total
    print(f"{name:<12}{qty:>5}{price:>10.2f}{line_total:>10.2f}")
print("-" * 37)
print(f"{'TOTAL':<27}{grand_total:>10.2f}")
```
Output:
```
Item          Qty     Price     Total
-------------------------------------
Notebook        3      2.50      7.50
Pen            10      0.80      8.00
Backpack        1     34.99     34.99
-------------------------------------
TOTAL                           50.49
```

**Example 2 – Multiplication table**
```python
n = 7
for i in range(1, 11):
    print(f"{n} x {i:>2} = {n * i:>3}")
```

**Example 3 – Progress bar**
```python
for pct in (0, 25, 50, 75, 100):
    filled = pct // 10
    print(f"[{'#' * filled}{'.' * (10 - filled)}] {pct:>3}%")
```

**Example 4 – Table of conversions**
```python
print(f"{'Decimal':>8} {'Binary':>10} {'Hex':>6}")
for n in (5, 42, 255):
    print(f"{n:>8} {n:>10b} {n:>6x}")
```

### 4.8 Try It
1. Print `1234567.891` as `1,234,567.89`.
2. Print `0.0734` as `7.34%`.
3. Print the word `Python` centered in a 21-character line padded with `=`.
4. Print `7` as `0007` and as binary padded to 8 digits.

### 4.9 Homework – Chapter 4
1. **Business card:** Given name, title, phone, and email variables, print a boxed card using `+`, `-`, `|` and alignment so the box edges line up regardless of text length (use `max(len(...))`).
2. **Grade report:** For three students and three scores each, print a table with name, scores, and average (1 decimal), aligned in columns.
3. **Loan table:** Print the first 6 months of a loan amortization (balance, interest, payment) with thousands separators and 2 decimals.
4. **Temperature table:** Print Celsius from -10 to 40 (step 10) and Fahrenheit, right-aligned with one decimal.

---

## 5. Lists

### 5.1 Learning goals
- Create, index, slice, and modify lists
- Use list methods and comprehensions
- Understand aliasing vs copying and nested lists

### 5.2 Creating lists

```python
numbers = [10, 20, 30, 40, 50]
mixed = [1, "two", 3.0, [4, 5], True]
empty = []
letters = list("python")     # ['p','y','t','h','o','n']
evens = list(range(0, 11, 2))# [0, 2, 4, 6, 8, 10]
print(len(numbers))          # 5
```

### 5.3 Indexing and slicing (same rules as strings)

```python
nums = [10, 20, 30, 40, 50]
print(nums[0], nums[-1])     # 10 50
print(nums[1:4])             # [20, 30, 40]
print(nums[::-1])            # [50, 40, 30, 20, 10]
print(nums[:2] + nums[3:])   # [10, 20, 40, 50]

nums[0] = 99                 # lists ARE mutable
nums[1:3] = [0, 0, 0]        # replace a slice (can change length)
print(nums)                  # [99, 0, 0, 0, 40, 50]
```

### 5.4 Methods overview

| Method | Effect | Returns |
|---|---|---|
| `append(x)` | Add `x` to end | `None` |
| `extend(iterable)` | Add all items to end | `None` |
| `insert(i, x)` | Insert at index | `None` |
| `remove(x)` | Remove first occurrence of value | `None` |
| `pop([i])` | Remove & return item (default last) | item |
| `clear()` | Remove everything | `None` |
| `index(x)` | Position of first `x` | int |
| `count(x)` | Number of `x` | int |
| `sort()` | Sort in place | `None` |
| `reverse()` | Reverse in place | `None` |
| `copy()` | Shallow copy | list |

```python
fruits = ["apple", "banana"]
fruits.append("cherry")           # ['apple','banana','cherry']
fruits.extend(["date", "fig"])    # adds each element
fruits.insert(1, "avocado")       # ['apple','avocado','banana',...]
fruits.remove("banana")
last = fruits.pop()               # 'fig'
first = fruits.pop(0)             # 'apple'
print(fruits, last, first)

# Common trap: append vs extend
a = [1, 2]
a.append([3, 4])   # [1, 2, [3, 4]]
b = [1, 2]
b.extend([3, 4])   # [1, 2, 3, 4]
```

### 5.5 Sorting

```python
nums = [5, 2, 9, 1]
nums.sort()                  # in place -> [1, 2, 5, 9]
nums.sort(reverse=True)      # [9, 5, 2, 1]

original = [5, 2, 9, 1]
new_list = sorted(original)  # new list; original unchanged

words = ["pear", "Apple", "fig", "banana"]
print(sorted(words))                  # uppercase sorts first
print(sorted(words, key=str.lower))   # ['Apple','banana','fig','pear']
print(sorted(words, key=len))         # ['fig','pear','Apple','banana']
```

> A very common bug: `x = my_list.sort()` sets `x` to `None`, because `sort()` returns `None`.

### 5.6 Useful built-ins and operations

```python
nums = [4, 8, 15, 16, 23, 42]
print(len(nums), min(nums), max(nums), sum(nums))
print(sum(nums) / len(nums))       # average
print(15 in nums, 99 not in nums)  # True True

for i, value in enumerate(nums, start=1):
    print(i, value)

names = ["Ali", "Sara", "Reza"]
scores = [18, 20, 15]
for n, s in zip(names, scores):
    print(n, s)
```

### 5.7 Copying and nested lists

```python
a = [1, 2, 3]
b = a            # alias (same object)
c = a.copy()     # or a[:] or list(a)  -> independent shallow copy

matrix = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
]
print(matrix[1][2])                    # 6
print([row[0] for row in matrix])      # first column: [1, 4, 7]

# Trap: this creates 3 references to the SAME inner list
bad = [[0] * 3] * 3
bad[0][0] = 1
print(bad)       # [[1,0,0],[1,0,0],[1,0,0]]

good = [[0] * 3 for _ in range(3)]
good[0][0] = 1
print(good)      # [[1,0,0],[0,0,0],[0,0,0]]
```

For nested structures use `import copy; copy.deepcopy(x)`.

### 5.8 List comprehensions

`[expression for item in iterable if condition]`

```python
squares = [n ** 2 for n in range(1, 6)]            # [1, 4, 9, 16, 25]
evens = [n for n in range(20) if n % 2 == 0]
upper = [w.upper() for w in ["a", "b"]]
labels = ["pass" if s >= 10 else "fail" for s in [8, 12, 17]]
flat = [x for row in [[1, 2], [3, 4]] for x in row]   # [1, 2, 3, 4]
```

### 5.9 Practical examples

**Example 1 – To-do list manager**
```python
todo = []

def show():
    if not todo:
        print("Nothing to do!")
    for i, task in enumerate(todo, 1):
        print(f"{i}. {task}")

todo.append("Study Python")
todo.append("Buy groceries")
todo.append("Call Mom")
todo.remove("Buy groceries")
todo.insert(0, "Wake up early")
show()
```

**Example 2 – Grade statistics**
```python
grades = [17.5, 14, 19, 12.25, 16, 20, 9.5]

average = sum(grades) / len(grades)
print(f"Average: {average:.2f}")
print(f"Highest: {max(grades)} | Lowest: {min(grades)}")

ordered = sorted(grades)
mid = len(ordered) // 2
median = ordered[mid] if len(ordered) % 2 else (ordered[mid - 1] + ordered[mid]) / 2
print(f"Median:  {median}")
print("Passed:", [g for g in grades if g >= 10])
```

**Example 3 – Remove duplicates, keep order**
```python
data = [3, 1, 3, 2, 1, 5, 2]
unique = []
for x in data:
    if x not in unique:
        unique.append(x)
print(unique)   # [3, 1, 2, 5]
```

**Example 4 – Rotate a list**
```python
def rotate(items, k):
    k %= len(items)
    return items[-k:] + items[:-k]

print(rotate([1, 2, 3, 4, 5], 2))   # [4, 5, 1, 2, 3]
```

**Example 5 – Matrix transpose**
```python
m = [[1, 2, 3], [4, 5, 6]]
t = [[row[i] for row in m] for i in range(len(m[0]))]
print(t)   # [[1, 4], [2, 5], [3, 6]]
```

### 5.10 Try It
1. Given `[3, 8, 1, 9]`, build a list of the squares of the odd numbers only.
2. What does `[1, 2, 3] * 2` produce? What does `[1, 2, 3] + [4]` produce?
3. Predict: `x = [1, 2, 3]; y = x; y += [4]; print(x)` — then try `y = y + [5]; print(x, y)`. Explain the difference.
4. Use `sorted()` with `key=` to sort `["bb", "a", "ccc", "dd"]` by length descending.

### 5.11 Homework – Chapter 5
1. **Shopping cart:** Keep a list of prices. Add 3 items, remove the most expensive one, and print the total and average.
2. **Second largest:** Return the second-largest *distinct* number in a list without using `sort()` on the original.
3. **Merge sorted lists:** Merge two already-sorted lists into one sorted list (no `sort()`).
4. **Chunking:** Split `list(range(1, 11))` into chunks of 3: `[[1,2,3],[4,5,6],[7,8,9],[10]]`.
5. **Tic-tac-toe board:** Represent a 3×3 board as a nested list; write `print_board(board)` and `check_row_winner(board)`.

---

## 6. Dictionaries

### 6.1 Learning goals
- Store and retrieve data with key–value pairs
- Use dictionary methods safely (`get`, `setdefault`, `update`, `pop`)
- Iterate over keys, values, and items
- Build nested dictionaries and dictionary comprehensions

### 6.2 Creating and accessing

```python
student = {
    "name": "Sara",
    "age": 21,
    "courses": ["Math", "Python"],
    "address": {"city": "Tehran", "zip": "12345"},
}

print(student["name"])               # Sara
print(student["courses"][1])         # Python
print(student["address"]["city"])    # Tehran

# print(student["email"])            # KeyError!
print(student.get("email"))          # None
print(student.get("email", "N/A"))   # N/A
```

Other ways to create dictionaries:
```python
d1 = dict(name="Ali", age=30)
d2 = dict([("a", 1), ("b", 2)])
d3 = dict.fromkeys(["x", "y", "z"], 0)   # {'x':0,'y':0,'z':0}
```

**Rules:** keys must be **hashable/immutable** (`str`, `int`, `tuple`, ...; not `list`, `dict`, `set`). Keys are unique. Since Python 3.7 dictionaries **preserve insertion order**.

### 6.3 Adding, updating, deleting

```python
car = {"brand": "Toyota", "year": 2020}
car["color"] = "white"          # add
car["year"] = 2022              # update
car.update({"year": 2023, "doors": 4})   # bulk add/update
removed = car.pop("doors")      # remove & return
del car["color"]                # remove
print(car)                      # {'brand': 'Toyota', 'year': 2023}
car.clear()                     # remove everything
```

### 6.4 Views: keys, values, items

```python
prices = {"apple": 1.2, "banana": 0.5, "cherry": 7.0}

print(list(prices.keys()))      # ['apple', 'banana', 'cherry']
print(list(prices.values()))    # [1.2, 0.5, 7.0]

for fruit, price in prices.items():
    print(f"{fruit:<8} ${price:.2f}")

print("apple" in prices)        # True  (tests KEYS)
print(7.0 in prices.values())   # True
```

### 6.5 Handy patterns

```python
# setdefault: get the value, or insert a default and return it
groups = {}
for word in ["apple", "avocado", "banana", "blueberry", "cherry"]:
    groups.setdefault(word[0], []).append(word)
print(groups)
# {'a': ['apple','avocado'], 'b': ['banana','blueberry'], 'c': ['cherry']}

# Merge (Python 3.9+)
defaults = {"theme": "light", "lang": "en"}
user = {"lang": "fa"}
settings = defaults | user      # {'theme': 'light', 'lang': 'fa'}

# Sort by value
scores = {"Ali": 17, "Sara": 20, "Reza": 15}
ranking = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
print(ranking)   # [('Sara', 20), ('Ali', 17), ('Reza', 15)]

# Best performer
print(max(scores, key=scores.get))   # Sara
```

### 6.6 Dictionary comprehension

```python
squares = {n: n ** 2 for n in range(1, 6)}      # {1:1, 2:4, 3:9, 4:16, 5:25}
inverted = {v: k for k, v in {"a": 1, "b": 2}.items()}   # {1:'a', 2:'b'}
passed = {n: s for n, s in scores.items() if s >= 16}
```

### 6.7 Practical examples

**Example 1 – Word frequency counter**
```python
text = "the quick brown fox jumps over the lazy dog the end"
freq = {}
for word in text.split():
    freq[word] = freq.get(word, 0) + 1

for word, count in sorted(freq.items(), key=lambda kv: kv[1], reverse=True)[:3]:
    print(f"{word}: {count}")
# the: 3 ... (others have 1)
```
(Shortcut: `from collections import Counter; Counter(text.split())`.)

**Example 2 – Inventory system**
```python
inventory = {"laptop": {"qty": 5, "price": 899.99},
             "mouse":  {"qty": 40, "price": 19.5}}

def sell(item, amount):
    if item not in inventory:
        return f"{item} not found"
    if inventory[item]["qty"] < amount:
        return f"Only {inventory[item]['qty']} {item}(s) left"
    inventory[item]["qty"] -= amount
    return f"Sold {amount} {item}(s): ${amount * inventory[item]['price']:.2f}"

print(sell("laptop", 2))
print(sell("mouse", 100))
print(sell("tablet", 1))

total_value = sum(i["qty"] * i["price"] for i in inventory.values())
print(f"Stock value: ${total_value:,.2f}")
```

**Example 3 – Phone book with search**
```python
contacts = {"ali": "0912-111-2233", "sara": "0935-444-5566"}
query = "sara"
print(contacts.get(query, "Not found"))
```

**Example 4 – Student records (list of dictionaries)**
```python
students = [
    {"name": "Ali", "grades": [17, 15, 18]},
    {"name": "Sara", "grades": [20, 19, 18]},
    {"name": "Reza", "grades": [12, 14, 10]},
]
for s in students:
    avg = sum(s["grades"]) / len(s["grades"])
    print(f"{s['name']:<6} avg = {avg:5.2f}")
```

**Example 5 – Group anagrams**
```python
words = ["listen", "silent", "enlist", "google", "gogole"]
groups = {}
for w in words:
    key = "".join(sorted(w))
    groups.setdefault(key, []).append(w)
print(list(groups.values()))
# [['listen','silent','enlist'], ['google','gogole']]
```

### 6.8 Try It
1. Build a dictionary mapping each letter in `"mississippi"` to its count.
2. Why does `{[1, 2]: "x"}` raise `TypeError`?
3. What is the difference between `d["k"]` and `d.get("k")` for a missing key?
4. Swap keys and values of `{"one": 1, "two": 2}`.

### 6.9 Homework – Chapter 6
1. **Gradebook:** `{name: [grades]}` → print a report with each student's average, plus the class top student.
2. **Caller ID:** Combine two phone books; on conflicts keep the second, and print the number of conflicts.
3. **Menu ordering:** Given a menu dictionary and an order list `["pizza", "cola", "pizza"]`, compute the total and print a line per distinct item with quantity.
4. **JSON-like profile:** Create a nested dictionary of a person (name, address, 3 skills with levels) and write a function that prints it indented.
5. **Roman numerals:** Use a dictionary to convert `"MCMXCIV"` to `1994`.

---

## 7. Tuples

### 7.1 Learning goals
- Create tuples and understand immutability
- Unpack tuples and return multiple values from functions
- Know when to choose a tuple vs a list

### 7.2 Creating tuples

```python
point = (3, 4)
colors = ("red", "green", "blue")
mixed = (1, "a", 3.5)
empty = ()

single = (5,)        # trailing comma required!
not_tuple = (5)      # just an int
print(type(single), type(not_tuple))

t = 1, 2, 3          # parentheses are optional
print(t, len(t))
print(tuple([1, 2, 3]))
```

### 7.3 Indexing, slicing, methods

```python
t = ("a", "b", "c", "b")
print(t[0], t[-1], t[1:3])    # a b ('b', 'c')
print(t.count("b"))           # 2
print(t.index("c"))           # 2
print("a" in t)               # True

# t[0] = "z"                  # TypeError: tuples are immutable
```

> Immutability is *shallow*: a tuple containing a list can still have that list modified.
> ```python
> t = (1, [2, 3])
> t[1].append(4)
> print(t)    # (1, [2, 3, 4])
> ```

### 7.4 Unpacking

```python
x, y = (3, 4)
name, age, city = ("Ali", 30, "Tehran")

first, *rest = [1, 2, 3, 4]      # first=1, rest=[2,3,4]
*start, last = (1, 2, 3, 4)      # start=[1,2,3], last=4
head, *middle, tail = range(6)   # 0, [1,2,3,4], 5

a, b = 1, 2
a, b = b, a                      # tuple packing/unpacking = swap
```

### 7.5 Why use tuples?

| Use tuples when... | Because... |
|---|---|
| Data should not change (coordinates, RGB, dates) | Safer, signals intent |
| You need a dictionary key or set element | Tuples are hashable (if contents are) |
| Returning multiple values | Natural, lightweight |
| Fixed-size records | Slightly faster and smaller than lists |

```python
def min_max(values):
    return min(values), max(values)      # returns a tuple

lo, hi = min_max([4, 9, 1, 7])
print(lo, hi)    # 1 9

# Tuples as dictionary keys
distances = {("Tehran", "Isfahan"): 440, ("Tehran", "Shiraz"): 930}
print(distances[("Tehran", "Isfahan")])   # 440
```

### 7.6 Named tuples (bonus)

```python
from collections import namedtuple

Point = namedtuple("Point", ["x", "y"])
p = Point(3, 4)
print(p.x, p.y)     # 3 4
print(p)            # Point(x=3, y=4)
```

### 7.7 Practical examples

**Example 1 – Distance between two points**
```python
import math

def distance(p1, p2):
    (x1, y1), (x2, y2) = p1, p2
    return math.hypot(x2 - x1, y2 - y1)

print(distance((0, 0), (3, 4)))   # 5.0
```

**Example 2 – RGB colors**
```python
RED = (255, 0, 0)
r, g, b = RED
print(f"#{r:02x}{g:02x}{b:02x}")   # #ff0000
```

**Example 3 – Iterating over (name, score) records**
```python
records = [("Ali", 17), ("Sara", 20), ("Reza", 15)]
for name, score in records:
    print(f"{name}: {score}")

best = max(records, key=lambda rec: rec[1])
print(best)   # ('Sara', 20)
```

**Example 4 – Statistics function returning multiple values**
```python
def stats(nums):
    total = sum(nums)
    return total, total / len(nums), min(nums), max(nums)

total, mean, lo, hi = stats([2, 4, 6, 8])
print(total, mean, lo, hi)   # 20 5.0 2 8
```

### 7.8 Try It
1. Create a tuple with one element in two different ways (one using `tuple()`).
2. Unpack `(1, 2, 3, 4, 5)` into `a`, `b`, and `rest`.
3. Explain why `t = (1, [2]); t[1].append(3)` works but `t[0] = 9` fails.
4. Convert a tuple to a list, change it, and convert it back.

### 7.9 Homework – Chapter 7
1. **Date tuples:** Given `(2026, 10, 14)`, print `14/10/2026` using unpacking and formatting.
2. **Closest pair:** Given a list of `(x, y)` points, find the pair closest to each other (brute force).
3. **Sort records:** Sort `[("Ali", 20), ("Sara", 18), ("Reza", 20)]` by age descending, then name ascending.
4. **Swap & rotate:** Write `rotate_tuple(t, k)` that returns a rotated *new* tuple.
5. **Grid keys:** Use tuples as keys to store a 3×3 board: `{(0,0): "X", ...}` and print it.

---

## 8. Sets and Booleans

### 8.1 Learning goals
- Create sets and use set algebra
- Remove duplicates and test membership quickly
- Understand `bool`, comparison, logical operators, truthiness, and `None`

### 8.2 Sets

A **set** is an unordered collection of **unique, hashable** items. Great for membership tests and eliminating duplicates.

```python
s = {1, 2, 3, 3, 2}
print(s)                    # {1, 2, 3}
print(len(s))

empty_set = set()           # NOT {} (that's an empty dict!)
print(type({}), type(set()))

letters = set("mississippi")
print(letters)              # {'m','i','s','p'} (order may vary)

print(2 in s)               # True
```

**Modifying sets**
```python
s = {1, 2, 3}
s.add(4)
s.add(2)             # no effect (already present)
s.update([5, 6])
s.remove(6)          # KeyError if missing
s.discard(99)        # no error if missing
x = s.pop()          # removes an arbitrary element
```

Sets have no indexing: `s[0]` raises `TypeError`.

### 8.3 Set operations

```python
a = {1, 2, 3, 4}
b = {3, 4, 5, 6}

print(a | b)    # union:                 {1, 2, 3, 4, 5, 6}
print(a & b)    # intersection:          {3, 4}
print(a - b)    # difference (a not b):  {1, 2}
print(a ^ b)    # symmetric difference:  {1, 2, 5, 6}

print({1, 2} <= a)     # subset: True
print(a >= {1, 2})     # superset: True
print(a.isdisjoint({9, 10}))   # True
```

Methods: `union()`, `intersection()`, `difference()`, `symmetric_difference()`, `issubset()`, `issuperset()`.

**Frozenset** – an immutable set (can be a dict key or set element):
```python
fs = frozenset([1, 2, 3])
```

**Set comprehension**
```python
print({n % 3 for n in range(10)})   # {0, 1, 2}
```

### 8.4 Booleans

```python
print(True, False, type(True))     # <class 'bool'>
print(True + True)                 # 2 (bool is a subclass of int)

# Comparisons produce booleans
print(5 > 3, 5 == 5.0, 5 != 4, "a" < "b")

# Chained comparisons
age = 25
print(18 <= age < 65)              # True
```

**Logical operators:** `and`, `or`, `not`

| A | B | `A and B` | `A or B` | `not A` |
|---|---|---|---|---|
| T | T | T | T | F |
| T | F | F | T | F |
| F | T | F | T | T |
| F | F | F | F | T |

```python
is_adult = True
has_ticket = False
print(is_adult and has_ticket)     # False
print(is_adult or has_ticket)      # True
print(not has_ticket)              # True
```

**Short-circuit evaluation**
```python
x = 0
print(x != 0 and 10 / x > 1)    # False  (division never evaluated)
name = ""
print(name or "Anonymous")      # Anonymous
```

### 8.5 Truthiness

The following are **falsy**: `False`, `None`, `0`, `0.0`, `""`, `[]`, `()`, `{}`, `set()`. Almost everything else is **truthy**.

```python
for value in [0, 1, "", "hi", [], [0], None, {}, {"a": 1}]:
    print(repr(value), "->", bool(value))

items = []
if not items:
    print("The list is empty")
```

### 8.6 `None`, `is` vs `==`

```python
result = None
print(result is None)        # True  (use `is` for None)

a = [1, 2]
b = [1, 2]
print(a == b)    # True  (same value)
print(a is b)    # False (different objects)
```

### 8.7 `any()` and `all()`

```python
scores = [12, 15, 9, 18]
print(all(s >= 10 for s in scores))   # False
print(any(s >= 18 for s in scores))   # True
print(all([]), any([]))               # True False
```

### 8.8 Practical examples

**Example 1 – Remove duplicates**
```python
emails = ["a@x.com", "b@x.com", "a@x.com", "c@x.com", "b@x.com"]
print(sorted(set(emails)))   # ['a@x.com','b@x.com','c@x.com']
```

**Example 2 – Class attendance**
```python
monday = {"Ali", "Sara", "Reza", "Neda"}
tuesday = {"Sara", "Neda", "Omid"}

print("Both days:", monday & tuesday)           # {'Sara','Neda'}
print("Any day:", monday | tuesday)
print("Only Monday:", monday - tuesday)
print("Exactly one day:", monday ^ tuesday)
```

**Example 3 – Job matching**
```python
required = {"python", "sql", "git"}
candidate = {"python", "git", "docker", "linux"}

missing = required - candidate
print("Qualified" if required <= candidate else f"Missing: {missing}")
# Missing: {'sql'}
```

**Example 4 – Find common/unique characters**
```python
w1, w2 = "listen", "silent"
print(set(w1) == set(w2))               # True (same letters)
print(sorted(set("hello") - set("world")))   # ['e', 'h']
```

**Example 5 – Fast lookup vs list**
```python
import time

big_list = list(range(1_000_000))
big_set = set(big_list)

t = time.perf_counter(); 999_999 in big_list; list_time = time.perf_counter() - t
t = time.perf_counter(); 999_999 in big_set;  set_time = time.perf_counter() - t
print(f"list: {list_time:.6f}s | set: {set_time:.6f}s")
```

**Example 6 – Login validation using booleans**
```python
username, password, is_locked = "ali", "S3cret!", False
valid = username == "ali" and password == "S3cret!" and not is_locked
print("Welcome!" if valid else "Access denied")
```

### 8.9 Try It
1. What do `bool("False")`, `bool("")`, `bool([[]])`, and `bool(0.0)` return, and why?
2. What is the output: `print(0 or [] or "x" or 5)`? And `print(1 and 2 and 0 and 3)`?
3. Why do you write `set()` and not `{}` for an empty set?
4. Is `{1, 2, 3} == {3, 2, 1}`? Is `[1, 2, 3] == [3, 2, 1]`?

### 8.10 Homework – Chapter 8
1. **Lottery:** Two lists of numbers (yours and the draw). Print the matches, the count, and whether you won (≥ 3 matches).
2. **Unique words:** Read a paragraph, print the number of unique words (case-insensitive, punctuation removed) and the words that appear in only one sentence.
3. **Friend suggestions:** Given `friends = {"Ali": {"Sara", "Reza"}, "Sara": {"Ali", "Neda"}, "Reza": {"Ali", "Omid"}}`, suggest friends-of-friends for Ali who are not already his friends.
4. **Boolean logic:** Write `can_vote(age, is_citizen, is_registered)`; truth-table test all combinations.
5. **Leap year:** Write one boolean expression: divisible by 4 and (not by 100 or divisible by 400).

---

## 9. Files

### 9.1 Learning goals
- Open, read, write, and append text files safely
- Use the `with` statement and handle file errors
- Work with paths (`pathlib`), CSV and JSON for persistent data

### 9.2 Opening files

```python
f = open("notes.txt", "w", encoding="utf-8")
f.write("Hello file!\n")
f.close()           # always close... or better, use `with`
```

**Always use `with`** – it closes the file automatically, even when an error occurs:

```python
with open("notes.txt", "w", encoding="utf-8") as f:
    f.write("Line 1\n")
    f.write("Line 2\n")
```

**File modes**

| Mode | Meaning | If file missing | Existing content |
|---|---|---|---|
| `"r"` | Read (default) | Error | Kept |
| `"w"` | Write | Creates | **Erased!** |
| `"a"` | Append | Creates | Kept, adds at end |
| `"x"` | Create exclusively | Creates | Error if exists |
| `"r+"` | Read + write | Error | Kept |
| `"rb"`, `"wb"` | Binary modes (images, PDFs) | — | — |

> **Tip for Persian/Unicode text:** always specify `encoding="utf-8"`, otherwise the default may depend on the operating system and produce garbled or failing output.

### 9.3 Reading

```python
with open("notes.txt", encoding="utf-8") as f:
    content = f.read()          # whole file as one string
print(content)

with open("notes.txt", encoding="utf-8") as f:
    first_line = f.readline()   # one line (includes "\n")
    rest = f.readlines()        # remaining lines as a list

# Best for big files: iterate line by line (memory efficient)
with open("notes.txt", encoding="utf-8") as f:
    for number, line in enumerate(f, start=1):
        print(number, line.rstrip("\n"))
```

### 9.4 Writing and appending

```python
lines = ["apple\n", "banana\n", "cherry\n"]
with open("fruits.txt", "w", encoding="utf-8") as f:
    f.writelines(lines)

with open("fruits.txt", "a", encoding="utf-8") as f:
    f.write("date\n")

# print() can write to files too
with open("report.txt", "w", encoding="utf-8") as f:
    print("Report title", file=f)
    print(f"Total: {42:,}", file=f)
```

### 9.5 Handling errors

```python
try:
    with open("missing.txt", encoding="utf-8") as f:
        data = f.read()
except FileNotFoundError:
    print("File not found - check the path.")
except PermissionError:
    print("No permission to read this file.")
else:
    print("Read OK:", len(data), "characters")
```

### 9.6 Paths with `pathlib`

```python
from pathlib import Path

folder = Path("data")
folder.mkdir(exist_ok=True)

file_path = folder / "scores.txt"       # `/` joins paths on any OS
file_path.write_text("Ali,17\nSara,20\n", encoding="utf-8")

print(file_path.exists())               # True
print(file_path.name, file_path.suffix) # scores.txt .txt
print(file_path.read_text(encoding="utf-8"))

for p in folder.glob("*.txt"):          # list files
    print(p)
```

### 9.7 CSV and JSON (structured data)

```python
import csv, json

# ---- CSV ----
rows = [["name", "score"], ["Ali", 17], ["Sara", 20]]
with open("scores.csv", "w", newline="", encoding="utf-8") as f:
    csv.writer(f).writerows(rows)

with open("scores.csv", newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        print(row["name"], row["score"])    # values are strings!

# ---- JSON ----
profile = {"name": "Sara", "skills": ["Python", "SQL"], "active": True}
with open("profile.json", "w", encoding="utf-8") as f:
    json.dump(profile, f, indent=2, ensure_ascii=False)   # keeps Persian readable

with open("profile.json", encoding="utf-8") as f:
    loaded = json.load(f)
print(loaded["skills"])
```

### 9.8 Practical examples

**Example 1 – Simple logger**
```python
from datetime import datetime

def log(message, filename="app.log"):
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(filename, "a", encoding="utf-8") as f:
        f.write(f"[{stamp}] {message}\n")

log("Application started")
log("User Ali logged in")
```

**Example 2 – Word counter for any text file**
```python
from collections import Counter
from pathlib import Path

def top_words(path, n=5):
    text = Path(path).read_text(encoding="utf-8").lower()
    words = [w.strip(".,!?;:\"'()") for w in text.split()]
    return Counter(w for w in words if w).most_common(n)

print(top_words("notes.txt"))
```

**Example 3 – Persistent contact book (dictionary + JSON)**
```python
import json
from pathlib import Path

DB = Path("contacts.json")

def load():
    return json.loads(DB.read_text(encoding="utf-8")) if DB.exists() else {}

def save(contacts):
    DB.write_text(json.dumps(contacts, indent=2, ensure_ascii=False), encoding="utf-8")

contacts = load()
contacts["sara"] = "0935-444-5566"
contacts["علی"] = "0912-111-2233"      # Unicode keys work fine
save(contacts)
print(load())
```

**Example 4 – Grade report from a text file**
```python
# grades.txt:  Ali,17,15,18  (one student per line)
with open("grades.txt", "w", encoding="utf-8") as f:
    f.write("Ali,17,15,18\nSara,20,19,18\nReza,12,14,10\n")

with open("grades.txt", encoding="utf-8") as src, \
     open("report.txt", "w", encoding="utf-8") as out:
    for line in src:
        name, *marks = line.strip().split(",")
        marks = [float(m) for m in marks]
        out.write(f"{name:<6} {sum(marks) / len(marks):6.2f}\n")

print(open("report.txt", encoding="utf-8").read())
```

**Example 5 – Safe file copy with line numbers**
```python
def copy_with_numbers(src, dst):
    with open(src, encoding="utf-8") as fin, open(dst, "w", encoding="utf-8") as fout:
        for i, line in enumerate(fin, 1):
            fout.write(f"{i:03d}: {line}")

copy_with_numbers("notes.txt", "notes_numbered.txt")
```

### 9.9 Try It
1. Create a file with 5 lines, read it back, and print only the lines containing the letter `a`.
2. What happens if you open an existing file with mode `"w"` and write nothing?
3. Why is `for line in f:` better than `f.readlines()` for a 2 GB log file?
4. Write a dictionary to JSON, read it back, and confirm `loaded == original`.

### 9.10 Homework – Chapter 9
1. **Note taker:** A loop asks the user for notes until they type `quit`, appending each (with a timestamp) to `notes.txt`.
2. **Line statistics:** For any text file, print the number of lines, words, characters, and the longest line.
3. **CSV summary:** Create `sales.csv` (`product,qty,price`), read it, and write `summary.txt` with per-product totals and the grand total (thousand separators, 2 decimals).
4. **Backup tool:** Write `backup(path)` that copies `file.txt` to `file_backup.txt`; refuse to overwrite an existing backup (hint: mode `"x"` or `Path.exists()`).
5. **Search tool:** Ask for a keyword and a filename; print each matching line with its line number; handle `FileNotFoundError` gracefully.
6. **Mini database:** Persist a list of dictionaries (students) to JSON, with functions `add_student`, `delete_student`, and `list_students`.

---

## 10. Objects and Data Structures Assessment Test

**Time:** 60–75 minutes · **Total:** 100 points · **Rules:** No internet; the Python shell is allowed for Part C only.

### Part A – Multiple Choice (2 points each = 20 points)

**A1.** What is the result of `7 // 2 + 7 % 2 * 2 ** 2`?
- a) 7  b) 5  c) 7.5  d) 3

**A2.** Which variable name is valid?
- a) `2nd_value`  b) `my-value`  c) `_value2`  d) `class`

**A3.** What does `"Python"[1:5:2]` return?
- a) `"yh"`  b) `"yo"`  c) `"yt"`  d) `"yth"`

**A4.** What does `(5)` evaluate to?
- a) a tuple with one item  b) the integer 5  c) an error  d) an empty tuple

**A5.** After `a = [1, 2]; b = a; b.append(3)`, what is `a`?
- a) `[1, 2]`  b) `[1, 2, 3]`  c) `[3]`  d) error

**A6.** Which creates an empty set?
- a) `{}`  b) `[]`  c) `set()`  d) `()`

**A7.** What does `{"a": 1}.get("b", 0)` return?
- a) `None`  b) `KeyError`  c) `0`  d) `"b"`

**A8.** Which file mode erases existing content?
- a) `"r"`  b) `"a"`  c) `"w"`  d) `"r+"`

**A9.** `bool([])` is:
- a) `True`  b) `False`  c) error  d) `None`

**A10.** What does `f"{3.14159:.2f}"` produce?
- a) `3.1`  b) `3.14`  c) `3.142`  d) `3.14159`

### Part B – Predict the Output (3 points each = 30 points)

**B1.**
```python
x = [1, 2, 3]
y = x[:]
y.append(4)
print(x, y)
```

**B2.**
```python
s = "banana"
print(s.count("an"), s.find("na"), s.replace("a", "o", 2))
```

**B3.**
```python
d = {"a": 1, "b": 2}
d["c"] = d.get("c", 10) + d["a"]
print(sorted(d.items()))
```

**B4.**
```python
a, *b, c = range(5)
print(a, b, c)
```

**B5.**
```python
print({1, 2, 3} & {2, 3, 4}, {1, 2} | {2, 5})
```

**B6.**
```python
print(0 or "", "hi" and 5, not [])
```

**B7.**
```python
nums = [5, 3, 8]
result = nums.sort()
print(result, nums)
```

**B8.**
```python
print(f"{255:#x} | {1234567:,} | {0.256:.0%} | {'ab':*>5}")
```

**B9.**
```python
t = (1, [2, 3])
t[1].append(4)
print(t, len(t))
```

**B10.**
```python
print([n * n for n in range(6) if n % 2 == 0])
```

### Part C – Coding Challenges (10 points each = 50 points)

**C1. Number toolkit.** Write `digit_stats(n)` returning a tuple `(digit_sum, digit_count, largest_digit)` for a positive integer — using arithmetic only (no string conversion). Test with `90517`.

**C2. String cleaner.** Write `clean_title(text)` that strips whitespace, collapses multiple internal spaces into one, and returns Title Case. Example: `"  the   lord of   THE rings "` → `"The Lord Of The Rings"`.

**C3. List processing.** Given `data = [4, -2, 7, 0, -9, 3, 7, 4]`, write code that prints: (a) the list without duplicates preserving order, (b) the sum of positive numbers, (c) the list sorted by absolute value, (d) the index of the first negative number.

**C4. Dictionary analytics.** Given:
```python
sales = [
    {"rep": "Ali", "region": "North", "amount": 1200},
    {"rep": "Sara", "region": "South", "amount": 950},
    {"rep": "Ali", "region": "South", "amount": 400},
    {"rep": "Reza", "region": "North", "amount": 780},
]
```
Print total sales per rep, total sales per region, and the top rep.

**C5. Files + data structures.** Write a program that reads `names.txt` (one name per line, possible duplicates and blank lines), then writes `unique_sorted.txt` containing the unique, case-insensitive, sorted names (blank lines removed), and prints how many duplicates were removed. Handle a missing input file gracefully.

---

### Answer Key

**Part A:** A1 → **a** (`7 // 2 = 3`; `7 % 2 = 1`; `2 ** 2 = 4`; `1 * 4 = 4`; `3 + 4 = 7`) ·
A2 → **c** · A3 → **a** (`"Python"[1:5:2]` → indices 1,3 → `"yh"`) · A4 → **b** · A5 → **b** · A6 → **c** · A7 → **c** · A8 → **c** · A9 → **b** · A10 → **b**

**Part B:**
- B1: `[1, 2, 3] [1, 2, 3, 4]`
- B2: `2 2 bonona` (count of `"an"` = 2; first `"na"` at index 2; replace first two `a` → `"bonona"`)
- B3: `[('a', 1), ('b', 2), ('c', 11)]`
- B4: `0 [1, 2, 3] 4`
- B5: `{2, 3} {1, 2, 5}`
- B6: `0 or ""` → `""` (when all operands are falsy, `or` returns the last one), `"hi" and 5` → `5`, `not []` → `True`. The printed line is an empty string, a space, then `5 True`, i.e. ` 5 True`
- B7: `None [3, 5, 8]`
- B8: `0xff | 1,234,567 | 26% | ***ab`
- B9: `(1, [2, 3, 4]) 2`
- B10: `[0, 4, 16]`

**Part C – Sample solutions**

```python
# C1
def digit_stats(n):
    total, count, largest = 0, 0, 0
    while n > 0:
        d = n % 10
        total += d
        count += 1
        largest = max(largest, d)
        n //= 10
    return total, count, largest

print(digit_stats(90517))   # (22, 5, 9)
```

```python
# C2
def clean_title(text):
    return " ".join(text.split()).title()

print(clean_title("  the   lord of   THE rings "))   # The Lord Of The Rings
```

```python
# C3
data = [4, -2, 7, 0, -9, 3, 7, 4]

unique = []
for x in data:
    if x not in unique:
        unique.append(x)
print(unique)                               # [4, -2, 7, 0, -9, 3]
print(sum(x for x in data if x > 0))        # 25
print(sorted(data, key=abs))                # [0, -2, 3, 4, 4, 7, 7, -9]
print(next(i for i, x in enumerate(data) if x < 0))   # 1
```

```python
# C4
by_rep, by_region = {}, {}
for s in sales:
    by_rep[s["rep"]] = by_rep.get(s["rep"], 0) + s["amount"]
    by_region[s["region"]] = by_region.get(s["region"], 0) + s["amount"]

print(by_rep)       # {'Ali': 1600, 'Sara': 950, 'Reza': 780}
print(by_region)    # {'North': 1980, 'South': 1350}
print("Top rep:", max(by_rep, key=by_rep.get))   # Ali
```

```python
# C5
try:
    with open("names.txt", encoding="utf-8") as f:
        names = [line.strip() for line in f if line.strip()]
except FileNotFoundError:
    print("names.txt not found.")
else:
    unique = {}
    for n in names:
        unique.setdefault(n.lower(), n.title())
    result = sorted(unique.values())
    with open("unique_sorted.txt", "w", encoding="utf-8") as out:
        out.write("\n".join(result) + "\n")
    print(f"Removed {len(names) - len(result)} duplicates")
```

**Scoring guide:** 90–100 Excellent · 75–89 Good · 60–74 Review weak chapters · < 60 Redo the chapters and homework.

---

## 11. Appendix

### 11.1 Data structure cheat sheet

| Type | Literal | Ordered | Mutable | Duplicates | Lookup | Typical use |
|---|---|---|---|---|---|---|
| `str` | `"abc"` | ✅ | ❌ | ✅ | by index | Text |
| `list` | `[1, 2]` | ✅ | ✅ | ✅ | by index | Ordered, changing collections |
| `tuple` | `(1, 2)` | ✅ | ❌ | ✅ | by index | Fixed records, multiple returns |
| `dict` | `{"a": 1}` | ✅ (insertion) | ✅ | keys unique | by key | Mappings, records |
| `set` | `{1, 2}` | ❌ | ✅ | ❌ | membership | Uniqueness, set algebra |
| `frozenset` | `frozenset({1})` | ❌ | ❌ | ❌ | membership | Hashable sets |

**Choosing quickly:** need order + change → `list` · fixed → `tuple` · label → `dict` · uniqueness / fast `in` → `set`.

### 11.2 Common mistakes checklist

| Mistake | Fix |
|---|---|
| Comparing floats with `==` | `math.isclose()` or `Decimal` |
| `x = lst.sort()` gives `None` | Use `lst.sort()` alone, or `sorted(lst)` |
| `b = a` expecting a copy | `b = a.copy()` / `a[:]` / `copy.deepcopy(a)` |
| `[[0]*3]*3` for a grid | `[[0]*3 for _ in range(3)]` |
| `{}` as empty set | `set()` |
| `(5)` as one-element tuple | `(5,)` |
| `d["missing"]` → `KeyError` | `d.get("missing", default)` |
| Forgetting `"\n"` with `write()` | Add `\n` explicitly |
| Opening with `"w"` and losing data | Use `"a"` for appending |
| Missing `encoding="utf-8"` | Always set it for text files |
| Naming a variable `list`, `str`, `dict`, `sum` | Choose descriptive non-built-in names |
| Using `is` to compare numbers/strings | Use `==` (reserve `is` for `None`) |
| Modifying a list while iterating over it | Iterate over a copy or build a new list |

### 11.3 Final project – "Student Management Console"

Combine everything from this module in one program.

**Requirements**

1. Store students as a **list of dictionaries**: `{"id": int, "name": str, "grades": [float, ...]}`.
2. Menu loop (numbers, strings, booleans): *Add student · Add grade · Show report · Search by name · Delete · Save & exit*.
3. Use **sets** to prevent duplicate student IDs.
4. Use **tuples** for returning `(average, highest, lowest)` from a stats function.
5. Print reports with aligned **f-string tables** (names left-aligned, numbers right-aligned with 2 decimals).
6. Persist everything in `students.json` (load at start, save on exit) with **error handling** for a missing or corrupt file.
7. Append every action to `activity.log` with a timestamp.

**Starter skeleton**
```python
import json
from datetime import datetime
from pathlib import Path

DB = Path("students.json")
LOG = Path("activity.log")

def log(msg):
    with LOG.open("a", encoding="utf-8") as f:
        f.write(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}\n")

def load():
    try:
        return json.loads(DB.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return []

def save(students):
    DB.write_text(json.dumps(students, indent=2, ensure_ascii=False), encoding="utf-8")

def stats(grades):
    return sum(grades) / len(grades), max(grades), min(grades)

def show_report(students):
    print(f"{'ID':<5}{'Name':<15}{'Avg':>8}{'Max':>8}{'Min':>8}")
    print("-" * 44)
    for s in students:
        if s["grades"]:
            avg, hi, lo = stats(s["grades"])
            print(f"{s['id']:<5}{s['name']:<15}{avg:>8.2f}{hi:>8.2f}{lo:>8.2f}")
        else:
            print(f"{s['id']:<5}{s['name']:<15}{'-':>8}{'-':>8}{'-':>8}")

# TODO: add_student, add_grade, search, delete, and the main menu loop
```

**Grading rubric (20 points):** correct data structures (5) · formatting (3) · file persistence (4) · error handling (3) · code clarity & naming (3) · extra feature of your choice, e.g., ranking, CSV export (2).

### 11.4 Suggested learning path

1. Complete all chapter *Try It* sections the same day you read them.
2. Do the homework within 48 hours; re-solve the ones you got wrong a week later.
3. Take the assessment *without* looking at the notes; review wrong answers by chapter.
4. Build the final project, then move on to **control flow, functions, and modules**, the natural next step.

---

*End of document.*
