function port(value, fallback) {
  const n = Number(value || fallback);
  if (!Number.isInteger(n) || n < 1024 || n > 65535)
    throw new Error('Development ports must be integers between 1024 and 65535.');
  return n;
}
function developmentConfig(env, addresses = []) {
  const websitePort = port(env.DEV_PORT, 5175),
    apiPort = port(env.DEV_API_PORT, 4005);
  const databaseProvider =
    env.DEV_DATABASE_PROVIDER || (env.NEON_AUTH_BASE_URL ? 'postgres' : 'sqlite');
  if (!['sqlite', 'postgres'].includes(databaseProvider))
    throw new Error('DEV_DATABASE_PROVIDER must be sqlite or postgres.');
  if (env.NEON_AUTH_BASE_URL && databaseProvider !== 'postgres')
    throw new Error('Managed Neon authentication requires PostgreSQL in local development.');
  if (databaseProvider === 'postgres' && !env.DATABASE_URL && !env.DIRECT_URL)
    throw new Error('DATABASE_URL or DIRECT_URL is required for PostgreSQL development.');
  const readyTimeoutMs = Number(env.DEV_API_READY_TIMEOUT_MS || 120000);
  if (!Number.isInteger(readyTimeoutMs) || readyTimeoutMs < 10000 || readyTimeoutMs > 300000)
    throw new Error('DEV_API_READY_TIMEOUT_MS must be between 10000 and 300000.');
  if (websitePort === apiPort) throw new Error('Frontend and API ports must differ.');
  if (!!env.DEV_TLS_CERT !== !!env.DEV_TLS_KEY)
    throw new Error('Set both DEV_TLS_CERT and DEV_TLS_KEY.');
  const scheme = env.DEV_TLS_CERT ? 'https' : 'http';
  const publicOrigin = env.APP_PUBLIC_URL || scheme + '://localhost:' + websitePort;
  const url = new URL(publicOrigin);
  if (url.origin !== publicOrigin || url.protocol !== scheme + ':')
    throw new Error('APP_PUBLIC_URL must be an origin matching the HTTP/HTTPS mode.');
  const origins = [
    ...new Set([
      publicOrigin,
      scheme + '://localhost:' + websitePort,
      ...addresses.map((a) => scheme + '://' + a + ':' + websitePort),
    ]),
  ];
  return {
    readyTimeoutMs,
    port: websitePort,
    apiPort,
    databaseProvider,
    host: env.DEV_HOST || '0.0.0.0',
    scheme,
    publicOrigin,
    origins,
  };
}
function developmentDatabaseUrl(env, provider) {
  if (provider !== 'postgres') return '';
  const directHost = env.NEON_DEVELOPMENT_DIRECT_HOST?.trim();
  const connectionString = directHost
    ? env.DIRECT_URL || env.DATABASE_URL
    : env.DATABASE_URL || env.DIRECT_URL;
  if (!connectionString)
    throw new Error('DATABASE_URL or DIRECT_URL is required for PostgreSQL development.');
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('The PostgreSQL connection URL is invalid.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('The PostgreSQL connection URL must use postgres:// or postgresql://.');
  if (directHost) {
    if (!/^[a-z0-9.-]+$/i.test(directHost) || directHost.includes('..'))
      throw new Error('NEON_DEVELOPMENT_DIRECT_HOST must be a hostname only.');
    url.hostname = directHost;
  }
  return url.toString();
}
function developmentEnvironmentFile(env, files) {
  if (env.DEV_ENV_FILE) return env.DEV_ENV_FILE;
  if (files.existsSync('.env.neon.development')) return '.env.neon.development';
  if (files.existsSync('.africore-dev.json')) {
    let local;
    try {
      local = JSON.parse(files.readFileSync('.africore-dev.json', 'utf8'));
    } catch {
      throw new Error('Invalid .africore-dev.json configuration.');
    }
    if (!local || typeof local.envFile !== 'string' || !local.envFile.trim())
      throw new Error('Set envFile in .africore-dev.json to your private environment file.');
    return local.envFile;
  }
  return '.env';
}
module.exports = { developmentConfig, developmentDatabaseUrl, developmentEnvironmentFile };
