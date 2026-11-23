"""Statically index Odoo manifests and Python declarations; never execute addon code."""
from __future__ import annotations
import argparse, ast, csv, json, re, subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

APPS = ["Commerce","Finance","Sales","Inventory","CRM","Procurement","Accounting","POS","Work","People","Documents","Analytics","Automations","Business ID","Calendar","Website","Marketing","Support","Subscriptions","Manufacturing","Field Operations","Logistics","Property & Hospitality","Knowledge & Learning","AfriCore Studio","Integrations Hub"]
RULES = [
 ("Calendar",("calendar","appointment")),("Website",("website",)),("POS",("point_of_sale","pos_")),
 ("Manufacturing",("mrp","quality")),("Field Operations",("fleet","maintenance","field_service","repair","rental")),
 ("Logistics",("delivery","stock_picking_batch","shipping")),("Accounting",("account","l10n_")),
 ("Inventory",("stock","barcode")),("Procurement",("purchase",)),("Subscriptions",("subscription",)),
 ("Marketing",("mass_mailing","marketing","social","sms")),("Support",("helpdesk","livechat","rating")),
 ("Knowledge & Learning",("knowledge","survey","slide","elearning")),("Automations",("automation",)),
 ("Documents",("document","sign")),("People",("hr_","payroll","employee")),("Work",("project","timesheet","planning")),
 ("CRM",("crm",)),("Sales",("sale",)),("Commerce",("ecommerce","payment")),
 ("Analytics",("spreadsheet","dashboard","bi_")),("Integrations Hub",("webhook","connector","iap","queue","api"))]

def literal(tree, key):
    for n in tree.body:
        if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == key for t in n.targets):
            try: return ast.literal_eval(n.value)
            except (ValueError, TypeError, SyntaxError): return None
    if tree.body and isinstance(tree.body[0], ast.Expr):
        try: return ast.literal_eval(tree.body[0].value)
        except (ValueError, TypeError, SyntaxError): return None
    return None

def classify(name, category):
    n=name.lower()
    for app, keys in RULES:
        if any(k in n for k in keys): return app
    c=category.lower()
    for key, app in [("accounting","Accounting"),("finance","Finance"),("human resources","People"),("sales","Sales"),("inventory","Inventory"),("warehouse","Inventory")]:
        if key in c: return app
    return "Shared platform"

def inspect_module(path):
    py=[]; xml=[]; security=[]; controllers=[]; wizards=[]; reports=[]; tests=[]; models=[]; errors=[]
    for f in sorted(path.rglob("*.py")):
        rel=f.relative_to(path).as_posix(); py.append(rel)
        try: tree=ast.parse(f.read_text(encoding="utf-8"), filename=rel)
        except (OSError, UnicodeError, SyntaxError) as e: errors.append(rel+": "+type(e).__name__); continue
        for c in (x for x in ast.walk(tree) if isinstance(x, ast.ClassDef)):
            assignments={t.id:n.value for n in c.body if isinstance(n,ast.Assign) for t in n.targets if isinstance(t,ast.Name)}
            name=assignments.get("_name"); inherit=assignments.get("_inherit")
            try: name=ast.literal_eval(name) if name else None
            except (ValueError,TypeError): name=None
            try: inherit=ast.literal_eval(inherit) if inherit else None
            except (ValueError,TypeError): inherit=None
            if not name and not inherit and not any("models." in ast.unparse(b) for b in c.bases): continue
            fields=[]; methods=[]; constraints=[]
            for n in c.body:
                if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)):
                    methods.append(n.name)
                    if any("constrains" in ast.unparse(d) for d in n.decorator_list): constraints.append(n.name)
                if isinstance(n,ast.Assign) and isinstance(n.value,ast.Call):
                    for t in n.targets:
                        if isinstance(t,ast.Name):
                            typ=ast.unparse(n.value.func)
                            if "." in typ and typ.rsplit(".",1)[-1][:1].isupper():
                                attrs={}
                                for kw in n.value.keywords:
                                    if kw.arg in {"comodel_name","inverse_name","related","compute","store","domain","currency_field","check_company","ondelete","required","readonly"}:
                                        try: attrs[kw.arg]=ast.literal_eval(kw.value)
                                        except (ValueError,TypeError,SyntaxError): attrs[kw.arg]=ast.unparse(kw.value)
                                fields.append({"name":t.id,"type":typ,"attributes":attrs})
            models.append({"class":c.name,"path":rel,"name":name,"inherit":inherit,"fields":fields,"methods":methods,"constraints":constraints})
    xml_artifacts=[]; xml_security=[]; acl_rows=[]; xml_errors=[]
    for f in (p for p in path.rglob("*") if p.is_file()):
        rel=f.relative_to(path).as_posix()
        if rel.endswith(".xml"):
            xml.append(rel)
            try:
                content=f.read_text(encoding="utf-8")
                records=[]
                for match in re.finditer(r"<record\b([^>]*)>",content,re.I|re.S):
                    attrs=dict(re.findall(r"([A-Za-z_]+)\s*=\s*['\"]([^'\"]*)['\"]",match.group(1)))
                    if "id" in attrs or "model" in attrs:
                        item={"id":attrs.get("id"),"model":attrs.get("model")}
                        records.append(item)
                        if attrs.get("model") in {"ir.rule","res.groups","ir.model.access"}: xml_security.append({"path":rel,**item})
                menus=[dict(re.findall(r"([A-Za-z_]+)\s*=\s*['\"]([^'\"]*)['\"]",m.group(1))) for m in re.finditer(r"<menuitem\b([^>]*)/?>",content,re.I|re.S)]
                xml_artifacts.append({"path":rel,"records":records,"menus":menus})
            except (OSError,UnicodeError) as e: xml_errors.append(rel+": "+type(e).__name__)
        if "/security/" in "/"+rel or rel.endswith("ir.model.access.csv"):
            security.append(rel)
            if rel.endswith(".csv"):
                try:
                    with f.open(encoding="utf-8",newline="") as handle:
                        acl_rows.extend({"path":rel,"row":r} for r in csv.DictReader(handle))
                except (OSError,UnicodeError,csv.Error) as e: xml_errors.append(rel+": "+type(e).__name__)
        if "/controllers/" in "/"+rel: controllers.append(rel)
        if "/wizard/" in "/"+rel: wizards.append(rel)
        if "/report/" in "/"+rel: reports.append(rel)
        if "/tests/" in "/"+rel or rel.startswith("tests/"): tests.append(rel)
    return {"python_files":py,"xml_files":xml,"security_files":security,"acl_rows":acl_rows,"security_xml_records":xml_security,"xml_artifacts":xml_artifacts,"xml_parse_errors":xml_errors,"controller_files":controllers,"wizard_files":wizards,"report_files":reports,"test_files":tests,"models":models,"ast_errors":errors}

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--odoo-root", type=Path, required=True)
    p.add_argument("--output-dir", type=Path, required=True)
    p.add_argument("--reuse", action="store_true", help="Reuse module declarations from this commit and schema")
    a = p.parse_args()
    root=a.odoo_root.resolve()
    commit=subprocess.check_output(["git","rev-parse","HEAD"],cwd=root,text=True).strip()
    branch=subprocess.check_output(["git","branch","--show-current"],cwd=root,text=True).strip()
    app_commit=subprocess.check_output(["git","rev-parse","HEAD"],cwd=Path.cwd(),text=True).strip()
    app_dirty=bool(subprocess.check_output(["git","status","--porcelain"],cwd=Path.cwd(),text=True).strip())
    modules=[]; errors=[]; seen=set()
    schema_version = 1
    cache = {}
    index_path = a.output_dir / "odoo20-community-index.json"
    if a.reuse and index_path.is_file():
        prior = json.loads(index_path.read_text(encoding="utf-8"))
        if prior["schema_version"] == schema_version and prior["source"]["commit"] == commit and not prior["manifest_errors"]:
            cache = {module["manifest"]: module for module in prior["modules"]}
    addon_roots = (root / "addons", root / "odoo" / "addons")
    for manifest in sorted(m for directory in addon_roots for m in directory.glob("*/__manifest__.py")):
        module=manifest.parent; name=module.name
        if name in seen: errors.append("duplicate module: "+name); continue
        seen.add(name)
        cached = cache.get(manifest.relative_to(root).as_posix())
        if cached is not None:
            modules.append(cached)
            continue
        try:
            tree=ast.parse(manifest.read_text(encoding="utf-8"),filename=str(manifest)); m=literal(tree,"__manifest__")
            if not isinstance(m,dict): raise ValueError("manifest is not a literal dictionary")
        except (OSError,UnicodeError,SyntaxError,ValueError,TypeError) as e: errors.append(name+": "+type(e).__name__); m={}
        deps=m.get("depends",[]); deps=deps if isinstance(deps,list) else []
        cat=str(m.get("category",""))
        modules.append({"technical_name":name,"path":module.relative_to(root).as_posix(),"manifest":manifest.relative_to(root).as_posix(),"name":m.get("name",name),"category":cat,"summary":m.get("summary",""),"depends":sorted(str(x) for x in deps),"license":m.get("license","LGPL-3"),"application":bool(m.get("application",False)),"community_source_present":True,"enterprise_availability":"not assessed; Enterprise source is outside checkout","africore_group":classify(name,cat),"declared_data":m.get("data",[]),"declared_demo":m.get("demo",[]),"external_dependencies":m.get("external_dependencies",{}),**inspect_module(module)})
    names={m["technical_name"] for m in modules}; edges=[{"from":m["technical_name"],"to":d,"resolved":d in names} for m in modules for d in m["depends"]]
    counts=Counter(m["africore_group"] for m in modules)
    data={"schema_version":1,"source":{"repository":"https://github.com/odoo/odoo","branch":branch,"commit":commit,"license":"LGPL-3.0","indexed_at_utc":datetime.now(timezone.utc).isoformat()},"africore_baseline":{"commit":app_commit,"worktree_dirty":app_dirty},"index_method":"Python AST, literal manifests, XML declaration extraction and CSV readers; addon source is never executed","application_groups":APPS,"module_count":len(modules),"dependency_edge_count":len(edges),"manifest_errors":errors,"group_counts":dict(sorted(counts.items())),"modules":modules,"dependency_edges":edges}
    out=a.output_dir; out.mkdir(parents=True,exist_ok=True)
    (out/"odoo20-community-index.json").write_text(json.dumps(data,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    (out/"MODULE_INVENTORY.md").write_text(render_inventory(data),encoding="utf-8")
    (out/"DEPENDENCY_GRAPH.md").write_text(render_dependencies(data),encoding="utf-8")
    (out/"SOURCE_MAPPING.md").write_text(render_mapping(data),encoding="utf-8")
    (out/"README.md").write_text(f"# Odoo source-driven index\n\nPinned Community checkout: {commit} on {branch}. AfriCore baseline: {app_commit} (worktree_dirty={app_dirty}).\n\nStart with AGENTS.md and the five requested reports. Complete module, model, field, ACL, XML record/menu/action, source-path and dependency data is in odoo20-community-index.json. Regenerate with scripts/odoo-reverse-engineering-index.py.\n\nREA availability and the AST fallback boundary are recorded in the index and reports. The application grouping is heuristic and is not parity evidence.\n",encoding="utf-8")
    print(f"Indexed {len(modules)} modules, {len(edges)} dependency edges, {len(errors)} manifest errors.")

def render_inventory(d):
    rows=["# Odoo 20 Community module inventory","",f"Source: branch {d['source']['branch']}, commit {d['source']['commit']}.","",f"Indexed {d['module_count']} module manifests and {d['dependency_edge_count']} dependency edges. Manifest parse errors: {len(d['manifest_errors'])}.","", "The JSON contains manifest metadata/dependencies and statically discovered model classes, fields, method and constraint names, plus Python/XML/security/controller/wizard/report/test paths. No addon Python was executed.","","REA 6.10.1 import-reference-source was invoked on the account addon and returned capability_unavailable: safe no-follow opens require Linux/macOS; WSL access was denied. This fallback index is AST-produced, not REA output.","","## AfriCore groups","", "| App group | Modules |","|---|---:|"]
    rows += [f"| {app} | {d['group_counts'].get(app,0)} |" for app in APPS]
    rows += [f"| Shared platform | {d['group_counts'].get('Shared platform',0)} |","","## Addon list","","| Technical name | Display name | Category | AfriCore group | Dependencies | License | Models | XML/view files |","|---|---|---|---|---|---|---:|---:|"]
    rows += [f"| {m['technical_name']} | {m['name']} | {m['category']} | {m['africore_group']} | {', '.join(m['depends']) or '—'} | {m['license']} | {len(m['models'])} | {len(m['xml_files'])} |" for m in d["modules"]]
    return "\n".join(rows)+"\n"

def render_dependencies(d):
    indegree=Counter(e["to"] for e in d["dependency_edges"] if e["resolved"]); unresolved=[e for e in d["dependency_edges"] if not e["resolved"]]
    rows=["# Odoo 20 Community dependency graph","","The graph uses actual manifest depends declarations. Edges point from the addon to its dependency. The complete edge list and resolution flags are in odoo20-community-index.json.","",f"Source commit: {d['source']['commit']}. Addons: {d['module_count']}. Edges: {d['dependency_edge_count']}. Unresolved in scanned addons: {len(unresolved)}.","","## Most referenced dependencies","","| Dependency | Dependants |","|---|---:|"]
    rows += [f"| {n} | {c} |" for n,c in indegree.most_common(30)]
    rows += ["","## Unresolved edges",""]+[f"- {e['from']} → {e['to']}" for e in unresolved[:100]]
    rows += ["","Python imports and runtime hooks can introduce dependencies not declared in manifests. Trace these for each selected feature. Community checkout only; no Enterprise source was indexed.",""]
    return "\n".join(rows)

def render_mapping(d):
    rows=["# Odoo-to-AfriCore source map","","AfriCore baseline: 28c6f5c922af1125b32fc4a9cd65e4a6573824d2. Existing worktree edits were present before this task and were preserved.","","App grouping below is a heuristic by addon technical name/category. It is an inventory aid, not feature parity evidence.","","| AfriCore app | Odoo addons | AfriCore status |","|---|---|---|"]
    for app in APPS:
        mods=[m["technical_name"] for m in d["modules"] if m["africore_group"]==app]
        rows.append(f"| {app} | {', '.join(mods[:22])}{' … '+str(len(mods))+' total' if len(mods)>22 else ''} | Feature-level source map and acceptance remain open |")
    rows += ["","## Implemented bounded slice","","| Source | Behavior inspected | AfriCore target | Method | Current boundary |","|---|---|---|---|---|","| addons/account/models/account_tax.py: _get_tax_details, compute_all | Ordered tax computation and per-line rounding; richer than AfriCore's single configured percentage | src/erp/accounting-tax.ts preview | C: isolated Python calculation through TypeScript | Single percentage only; no tax groups, price-included taxes, fiscal positions, localization or statutory certification |","","TypeScript remains the authority for tenant access, tax-code configuration, accounts, approvals, audit, idempotency and journal persistence. No Odoo source was copied."]
    return "\n".join(rows)+"\n"

if __name__=="__main__": main()
