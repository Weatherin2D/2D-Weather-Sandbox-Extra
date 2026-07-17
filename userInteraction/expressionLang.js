/**
 * Sandboxed expression language for custom User Interaction tools.
 * No eval, no DOM, no network — recursive-descent parse + evaluate only.
 */
(function(global) {
  'use strict';

  const TOKEN = {
    NUM: 'NUM', STR: 'STR', ID: 'ID',
    PLUS: '+', MINUS: '-', STAR: '*', SLASH: '/', PERCENT: '%',
    LP: '(', RP: ')', COMMA: ',', DOT: '.',
    EQ: '==', NE: '!=', LT: '<', LE: '<=', GT: '>', GE: '>=',
    AND: 'and', OR: 'or', NOT: 'not',
    IF: 'if', THEN: 'then', ELSE: 'else',
    TRUE: 'true', FALSE: 'false',
    EOF: 'EOF',
  };

  function isAlpha(c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
  }
  function isDigit(c) {
    return c >= '0' && c <= '9';
  }
  function isAlnum(c) {
    return isAlpha(c) || isDigit(c);
  }

  function tokenize(src) {
    const s = String(src || '');
    const tokens = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (c === '/' && s[i + 1] === '/') {
        while (i < s.length && s[i] !== '\n') i++;
        continue;
      }
      if (isDigit(c) || (c === '.' && isDigit(s[i + 1]))) {
        let j = i;
        while (j < s.length && (isDigit(s[j]) || s[j] === '.')) j++;
        const num = parseFloat(s.slice(i, j));
        if (!Number.isFinite(num)) throw new Error('Invalid number near ' + i);
        tokens.push({ type: TOKEN.NUM, value: num });
        i = j;
        continue;
      }
      if (c === '"' || c === "'") {
        const quote = c;
        let j = i + 1;
        let out = '';
        while (j < s.length && s[j] !== quote) {
          if (s[j] === '\\' && j + 1 < s.length) {
            out += s[j + 1];
            j += 2;
          } else {
            out += s[j];
            j++;
          }
        }
        if (j >= s.length) throw new Error('Unterminated string');
        tokens.push({ type: TOKEN.STR, value: out });
        i = j + 1;
        continue;
      }
      if (s.startsWith('==', i)) { tokens.push({ type: TOKEN.EQ }); i += 2; continue; }
      if (s.startsWith('!=', i)) { tokens.push({ type: TOKEN.NE }); i += 2; continue; }
      if (s.startsWith('<=', i)) { tokens.push({ type: TOKEN.LE }); i += 2; continue; }
      if (s.startsWith('>=', i)) { tokens.push({ type: TOKEN.GE }); i += 2; continue; }
      if (c === '<') { tokens.push({ type: TOKEN.LT }); i++; continue; }
      if (c === '>') { tokens.push({ type: TOKEN.GT }); i++; continue; }
      if (c === '+') { tokens.push({ type: TOKEN.PLUS }); i++; continue; }
      if (c === '-') { tokens.push({ type: TOKEN.MINUS }); i++; continue; }
      if (c === '*') { tokens.push({ type: TOKEN.STAR }); i++; continue; }
      if (c === '/') { tokens.push({ type: TOKEN.SLASH }); i++; continue; }
      if (c === '%') { tokens.push({ type: TOKEN.PERCENT }); i++; continue; }
      if (c === '(') { tokens.push({ type: TOKEN.LP }); i++; continue; }
      if (c === ')') { tokens.push({ type: TOKEN.RP }); i++; continue; }
      if (c === ',') { tokens.push({ type: TOKEN.COMMA }); i++; continue; }
      if (c === '.') { tokens.push({ type: TOKEN.DOT }); i++; continue; }
      if (isAlpha(c)) {
        let j = i + 1;
        while (j < s.length && isAlnum(s[j])) j++;
        const word = s.slice(i, j);
        const lower = word.toLowerCase();
        if (lower === 'and') tokens.push({ type: TOKEN.AND });
        else if (lower === 'or') tokens.push({ type: TOKEN.OR });
        else if (lower === 'not') tokens.push({ type: TOKEN.NOT });
        else if (lower === 'if') tokens.push({ type: TOKEN.IF });
        else if (lower === 'then') tokens.push({ type: TOKEN.THEN });
        else if (lower === 'else') tokens.push({ type: TOKEN.ELSE });
        else if (lower === 'true') tokens.push({ type: TOKEN.TRUE });
        else if (lower === 'false') tokens.push({ type: TOKEN.FALSE });
        else tokens.push({ type: TOKEN.ID, value: word });
        i = j;
        continue;
      }
      throw new Error('Unexpected character "' + c + '" at ' + i);
    }
    tokens.push({ type: TOKEN.EOF });
    return tokens;
  }

  function Parser(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }
  Parser.prototype.peek = function() { return this.tokens[this.pos]; };
  Parser.prototype.advance = function() { return this.tokens[this.pos++]; };
  Parser.prototype.match = function(type) {
    if (this.peek().type === type) { this.advance(); return true; }
    return false;
  };
  Parser.prototype.expect = function(type) {
    if (this.peek().type !== type)
      throw new Error('Expected ' + type + ', got ' + this.peek().type);
    return this.advance();
  };

  Parser.prototype.parse = function() {
    const expr = this.parseOr();
    if (this.peek().type !== TOKEN.EOF)
      throw new Error('Unexpected token after expression: ' + this.peek().type);
    return expr;
  };

  Parser.prototype.parseOr = function() {
    let left = this.parseAnd();
    while (this.match(TOKEN.OR)) {
      const right = this.parseAnd();
      left = { type: 'bin', op: 'or', left: left, right: right };
    }
    return left;
  };

  Parser.prototype.parseAnd = function() {
    let left = this.parseEquality();
    while (this.match(TOKEN.AND)) {
      const right = this.parseEquality();
      left = { type: 'bin', op: 'and', left: left, right: right };
    }
    return left;
  };

  Parser.prototype.parseEquality = function() {
    let left = this.parseCompare();
    while (true) {
      if (this.match(TOKEN.EQ)) left = { type: 'bin', op: '==', left: left, right: this.parseCompare() };
      else if (this.match(TOKEN.NE)) left = { type: 'bin', op: '!=', left: left, right: this.parseCompare() };
      else break;
    }
    return left;
  };

  Parser.prototype.parseCompare = function() {
    let left = this.parseAdd();
    while (true) {
      if (this.match(TOKEN.LT)) left = { type: 'bin', op: '<', left: left, right: this.parseAdd() };
      else if (this.match(TOKEN.LE)) left = { type: 'bin', op: '<=', left: left, right: this.parseAdd() };
      else if (this.match(TOKEN.GT)) left = { type: 'bin', op: '>', left: left, right: this.parseAdd() };
      else if (this.match(TOKEN.GE)) left = { type: 'bin', op: '>=', left: left, right: this.parseAdd() };
      else break;
    }
    return left;
  };

  Parser.prototype.parseAdd = function() {
    let left = this.parseMul();
    while (true) {
      if (this.match(TOKEN.PLUS)) left = { type: 'bin', op: '+', left: left, right: this.parseMul() };
      else if (this.match(TOKEN.MINUS)) left = { type: 'bin', op: '-', left: left, right: this.parseMul() };
      else break;
    }
    return left;
  };

  Parser.prototype.parseMul = function() {
    let left = this.parseUnary();
    while (true) {
      if (this.match(TOKEN.STAR)) left = { type: 'bin', op: '*', left: left, right: this.parseUnary() };
      else if (this.match(TOKEN.SLASH)) left = { type: 'bin', op: '/', left: left, right: this.parseUnary() };
      else if (this.match(TOKEN.PERCENT)) left = { type: 'bin', op: '%', left: left, right: this.parseUnary() };
      else break;
    }
    return left;
  };

  Parser.prototype.parseUnary = function() {
    if (this.match(TOKEN.NOT)) return { type: 'unary', op: 'not', expr: this.parseUnary() };
    if (this.match(TOKEN.MINUS)) return { type: 'unary', op: '-', expr: this.parseUnary() };
    if (this.match(TOKEN.PLUS)) return this.parseUnary();
    if (this.match(TOKEN.IF)) {
      const cond = this.parseOr();
      this.expect(TOKEN.THEN);
      const thenExpr = this.parseOr();
      this.expect(TOKEN.ELSE);
      const elseExpr = this.parseOr();
      return { type: 'if', cond: cond, then: thenExpr, else: elseExpr };
    }
    return this.parsePrimary();
  };

  Parser.prototype.parsePrimary = function() {
    const t = this.peek();
    if (t.type === TOKEN.NUM) { this.advance(); return { type: 'num', value: t.value }; }
    if (t.type === TOKEN.STR) { this.advance(); return { type: 'str', value: t.value }; }
    if (t.type === TOKEN.TRUE) { this.advance(); return { type: 'bool', value: true }; }
    if (t.type === TOKEN.FALSE) { this.advance(); return { type: 'bool', value: false }; }
    if (t.type === TOKEN.ID) {
      this.advance();
      let node = { type: 'id', name: t.value };
      while (this.match(TOKEN.DOT)) {
        const prop = this.expect(TOKEN.ID);
        node = { type: 'member', object: node, prop: prop.value };
      }
      if (this.match(TOKEN.LP)) {
        const args = [];
        if (this.peek().type !== TOKEN.RP) {
          args.push(this.parseOr());
          while (this.match(TOKEN.COMMA)) args.push(this.parseOr());
        }
        this.expect(TOKEN.RP);
        if (node.type !== 'id') throw new Error('Only bare function names may be called');
        return { type: 'call', name: node.name, args: args };
      }
      return node;
    }
    if (this.match(TOKEN.LP)) {
      const inner = this.parseOr();
      this.expect(TOKEN.RP);
      return inner;
    }
    throw new Error('Unexpected token: ' + t.type);
  };

  const BUILTINS = {
    min: function(a, b) { return Math.min(+a, +b); },
    max: function(a, b) { return Math.max(+a, +b); },
    clamp: function(x, lo, hi) { return Math.min(Math.max(+x, +lo), +hi); },
    abs: function(x) { return Math.abs(+x); },
    lerp: function(a, b, t) { return +a + (+b - +a) * +t; },
    smoothstep: function(e0, e1, x) {
      const t = Math.min(Math.max((+x - +e0) / (+e1 - +e0), 0), 1);
      return t * t * (3 - 2 * t);
    },
    sign: function(x) { return Math.sign(+x); },
    sqrt: function(x) { return Math.sqrt(Math.max(0, +x)); },
  };

  function truthy(v) {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0 && Number.isFinite(v);
    if (typeof v === 'string') return v.length > 0 && v !== 'none' && v !== 'false';
    return !!v;
  }

  function resolveMember(node, ctx) {
    if (node.type === 'id') {
      if (Object.prototype.hasOwnProperty.call(ctx, node.name))
        return ctx[node.name];
      throw new Error('Unknown variable: ' + node.name);
    }
    if (node.type === 'member') {
      const obj = resolveMember(node.object, ctx);
      if (obj == null || typeof obj !== 'object')
        throw new Error('Cannot access property "' + node.prop + '"');
      if (!Object.prototype.hasOwnProperty.call(obj, node.prop))
        throw new Error('Unknown property: ' + node.prop);
      return obj[node.prop];
    }
    throw new Error('Invalid member expression');
  }

  function evaluate(ast, ctx) {
    if (!ast) return 0;
    switch (ast.type) {
      case 'num': return ast.value;
      case 'str': return ast.value;
      case 'bool': return ast.value;
      case 'id':
      case 'member':
        return resolveMember(ast, ctx || {});
      case 'unary': {
        const v = evaluate(ast.expr, ctx);
        if (ast.op === 'not') return !truthy(v);
        if (ast.op === '-') return -(+v);
        return v;
      }
      case 'bin': {
        if (ast.op === 'and') return truthy(evaluate(ast.left, ctx)) && truthy(evaluate(ast.right, ctx));
        if (ast.op === 'or') return truthy(evaluate(ast.left, ctx)) || truthy(evaluate(ast.right, ctx));
        const a = evaluate(ast.left, ctx);
        const b = evaluate(ast.right, ctx);
        switch (ast.op) {
          case '+': return (typeof a === 'string' || typeof b === 'string') ? String(a) + String(b) : (+a) + (+b);
          case '-': return (+a) - (+b);
          case '*': return (+a) * (+b);
          case '/': return (+b) === 0 ? 0 : (+a) / (+b);
          case '%': return (+b) === 0 ? 0 : (+a) % (+b);
          case '==': return a == b;
          case '!=': return a != b;
          case '<': return (+a) < (+b);
          case '<=': return (+a) <= (+b);
          case '>': return (+a) > (+b);
          case '>=': return (+a) >= (+b);
          default: throw new Error('Unknown operator: ' + ast.op);
        }
      }
      case 'if':
        return truthy(evaluate(ast.cond, ctx)) ? evaluate(ast.then, ctx) : evaluate(ast.else, ctx);
      case 'call': {
        const fn = BUILTINS[ast.name];
        if (!fn) throw new Error('Unknown function: ' + ast.name);
        const args = ast.args.map(function(arg) { return evaluate(arg, ctx); });
        return fn.apply(null, args);
      }
      default:
        throw new Error('Unknown AST node: ' + ast.type);
    }
  }

  function compile(src) {
    const text = (src == null || src === '') ? '0' : String(src);
    const tokens = tokenize(text);
    const ast = new Parser(tokens).parse();
    return {
      ast: ast,
      source: text,
      eval: function(ctx) { return evaluate(ast, ctx || {}); },
    };
  }

  function validate(src) {
    try {
      compile(src);
      return { ok: true, error: null };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  }

  function evalExpr(src, ctx) {
    return compile(src).eval(ctx || {});
  }

  const api = {
    tokenize: tokenize,
    compile: compile,
    validate: validate,
    eval: evalExpr,
    evaluate: evaluate,
    BUILTINS: BUILTINS,
  };

  global.UserInteraction = global.UserInteraction || {};
  global.UserInteraction.lang = api;
})(typeof window !== 'undefined' ? window : global);
