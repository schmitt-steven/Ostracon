/**
 * Zero-cost tag suggestion: a closed keyword -> tag map matched against a
 * note's title + body. Pure and synchronous. Edit KEYWORD_MAP to tune it.
 */

const KEYWORD_MAP: Record<string, string[]> = {
  // Languages
  rust: ["rust", "cargo", "rustc", "borrow checker", "tokio"],
  typescript: ["typescript", "tsconfig", "ts-node"],
  javascript: ["javascript", "node.js", "npm", "ecmascript"],
  python: ["python", "pip", "pytest", "numpy", "pandas"],
  go: ["golang", "goroutine", "go mod"],
  java: ["java", "spring boot", "maven", "gradle", "jvm"],
  "c++": ["c++", "cpp", "cmake"],
  "c#": ["c#", ".net", "dotnet"],
  sql: ["sql", "postgres", "postgresql", "mysql", "sqlite", "query planner"],

  // Frameworks / libraries
  react: ["react", "usestate", "useeffect", "jsx", "react hook"],
  "next.js": ["next.js", "nextjs", "app router", "server component"],
  vue: ["vue", "vuex", "composition api"],
  svelte: ["svelte", "sveltekit"],
  express: ["express.js", "express middleware"],
  docker: ["docker", "dockerfile", "docker-compose", "container image"],
  kubernetes: ["kubernetes", "k8s", "kubectl", "helm chart"],

  // Categories
  frontend: ["frontend", "css", "dom", "browser rendering", "ui component"],
  backend: ["backend", "api endpoint", "server-side", "microservice"],
  database: ["database", "db index", "migration", "schema", "orm"],
  devops: ["ci/cd", "deployment pipeline", "terraform", "infrastructure"],
  testing: ["unit test", "integration test", "test coverage", "mocking"],
  security: [
    "authentication",
    "authorization",
    "encryption",
    "vulnerability",
    "csrf",
    "xss",
  ],
  networking: ["tcp", "http", "dns", "load balancer", "websocket"],
  ai: [
    "machine learning",
    "neural network",
    "llm",
    "transformer model",
    "embedding",
    "gpt",
  ],
  algorithms: [
    "big o",
    "time complexity",
    "binary search",
    "sorting algorithm",
    "recursion",
  ],
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Plain-word keywords get \b boundaries so "java" doesn't match "javascript".
// Keywords with symbols (c++, c#, .net) skip them (\b is unreliable there).
function isWordSafe(keyword: string): boolean {
  return /^[a-z0-9][a-z0-9 -]*$/i.test(keyword);
}

function buildMatchers(map: Record<string, string[]>): Map<string, RegExp[]> {
  const matchers = new Map<string, RegExp[]>();
  for (const [tag, keywords] of Object.entries(map)) {
    matchers.set(
      tag,
      keywords.map((keyword) => {
        const escaped = escapeRegExp(keyword);
        return isWordSafe(keyword)
          ? new RegExp(`\\b${escaped}\\b`, "i")
          : new RegExp(escaped, "i");
      }),
    );
  }
  return matchers;
}

const MATCHERS = buildMatchers(KEYWORD_MAP);

export function suggestTags(text: string): string[] {
  const suggestions: string[] = [];
  for (const [tag, patterns] of MATCHERS) {
    if (patterns.some((pattern) => pattern.test(text))) {
      suggestions.push(tag);
    }
  }
  return suggestions;
}
