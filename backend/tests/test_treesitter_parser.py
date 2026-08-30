from app.parsers.treesitter_parser import TreeSitterParser


def test_treesitter_javascript_parsing():
    parser = TreeSitterParser()
    js_code = """
import { helper } from './utils';
const express = require('express');

class UserService extends BaseService {
  constructor(db) {
    super();
    this.db = db;
  }

  async findUser(id) {
    /** Fetch user by ID */
    if (id > 0) {
      return this.db.get(id);
    }
    return null;
  }
}

const formatName = (user) => {
  return user.first + ' ' + user.last;
};
"""
    result = parser.parse("service.js", js_code)
    assert result.success is True
    assert result.language == "javascript"
    
    # Check symbols
    sym_map = {s.name: s for s in result.symbols}
    assert "UserService" in sym_map
    assert sym_map["UserService"].symbol_type == "class"
    assert "findUser" in sym_map
    assert sym_map["findUser"].symbol_type == "method"
    assert sym_map["findUser"].is_async is True
    assert sym_map["findUser"].cyclomatic_complexity >= 2
    assert "formatName" in sym_map

    # Check imports
    imp_map = {i.imported_name: i for i in result.imports}
    assert "helper" in imp_map
    assert imp_map["helper"].source_module == "./utils"
    assert "express" in imp_map


def test_treesitter_typescript_interfaces_and_routes():
    parser = TreeSitterParser()
    ts_code = """
import { Router } from 'express';

export interface IConfig {
  port: number;
  host: string;
}

const router = Router();

router.post('/api/v1/auth/login', async (req, res) => {
  const token = await authenticate(req.body);
  return res.json({ token });
});
"""
    result = parser.parse("router.ts", ts_code)
    assert result.success is True
    assert result.language == "typescript"

    sym_names = [s.name for s in result.symbols]
    assert "IConfig" in sym_names
    assert any("POST" in s for s in sym_names)
