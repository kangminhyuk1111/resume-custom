import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import Handlebars from 'handlebars';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const log = (...a) => console.log('[build]', ...a);

async function readYaml(p) {
  return yaml.load(await fs.readFile(p, 'utf8'));
}

function deepMerge(target, source) {
  if (Array.isArray(source)) return source.slice();
  if (source === null || typeof source !== 'object') return source;
  const out = { ...target };
  for (const k of Object.keys(source)) {
    const sv = source[k];
    if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
      out[k] = deepMerge(target?.[k] ?? {}, sv);
    } else {
      out[k] = Array.isArray(sv) ? sv.slice() : sv;
    }
  }
  return out;
}

async function resolveVariant(name) {
  const fileName = name === 'default' ? '_default.yml' : `${name}.yml`;
  const variantPath = path.join(ROOT, 'variants', fileName);
  const variant = await readYaml(variantPath);
  if (variant.extends) {
    const parentName = variant.extends.replace(/\.ya?ml$/, '').replace(/^_/, '');
    const parent = await resolveVariant(parentName);
    delete variant.extends;
    return deepMerge(parent, variant);
  }
  return variant;
}

function reorderBlocks(blocks, projConfig) {
  if (!projConfig?.problems) return blocks;
  const include = projConfig.problems;
  const order = projConfig.problems_order ?? include;

  const filtered = blocks.filter(
    b => b.type !== 'problem' || include.includes(b.id)
  );
  const problems = filtered.filter(b => b.type === 'problem');
  problems.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

  const firstProblemIdx = filtered.findIndex(b => b.type === 'problem');
  if (firstProblemIdx === -1) return filtered;

  const before = filtered.slice(0, firstProblemIdx).filter(b => b.type !== 'problem');
  const after = filtered.slice(firstProblemIdx).filter(b => b.type !== 'problem');
  return [...before, ...problems, ...after];
}

async function loadData(variant) {
  const profile = await readYaml(path.join(ROOT, 'data', 'profile.yml'));
  const summary = await readYaml(path.join(ROOT, 'data', 'summary.yml'));
  const certifications = await readYaml(path.join(ROOT, 'data', 'certifications.yml'));
  const education = await readYaml(path.join(ROOT, 'data', 'education.yml'));

  const expIds = variant.experience?.include ?? ['uns-networks'];
  const experiences = await Promise.all(
    expIds.map(id => readYaml(path.join(ROOT, 'data', 'experience', `${id}.yml`)))
  );
  const experience = experiences[0];

  const projectIds = variant.projects?.include ?? [];
  const order = variant.projects?.order ?? projectIds;
  const orderedIds = order.filter(id => projectIds.includes(id));
  const projectsRaw = await Promise.all(
    orderedIds.map(id => readYaml(path.join(ROOT, 'data', 'projects', `${id}.yml`)))
  );

  const projects = projectsRaw.map(proj => ({
    ...proj,
    blocks: reorderBlocks(proj.blocks, variant.projects?.[proj.id])
  }));

  return {
    profile,
    summary,
    experience,
    projects,
    education,
    certifications,
    enabled: variant.sections ?? {
      hero: true, summary: true, experience: true,
      projects: true, education: true, certifications: true
    }
  };
}

async function registerPartials() {
  const compDir = path.join(ROOT, 'components');
  const files = await fs.readdir(compDir);
  for (const f of files) {
    if (!f.endsWith('.hbs')) continue;
    const name = f.replace('.hbs', '');
    const src = await fs.readFile(path.join(compDir, f), 'utf8');
    Handlebars.registerPartial(name, src);
  }
}

function registerHelpers() {
  Handlebars.registerHelper('eq', (a, b) => a === b);
}

async function build(variantName) {
  registerHelpers();
  await registerPartials();

  const variant = await resolveVariant(variantName);
  const data = await loadData(variant);

  const tmplDir = path.join(ROOT, 'templates', variant.template);
  const layoutSrc = await fs.readFile(path.join(tmplDir, 'layout.hbs'), 'utf8');
  const layout = Handlebars.compile(layoutSrc);
  const html = layout(data);

  const outDir = path.join(ROOT, 'dist', variantName);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'index.html'), html, 'utf8');
  await fs.copyFile(path.join(tmplDir, 'style.css'), path.join(outDir, 'style.css'));
  await fs.copyFile(
    path.join(ROOT, 'themes', `${variant.theme}.css`),
    path.join(outDir, 'theme.css')
  );

  log(`✓ ${variantName} → dist/${variantName}/index.html`);
}

const variantArg = process.argv[2] ?? 'default';
build(variantArg).catch(err => {
  console.error('[build] failed:', err);
  process.exit(1);
});
