import type {
  BenchmarkDefinition,
  BenchmarkRun,
  ExecutionObserver,
} from "../types";
import type { Results } from "../infra/sqlite";

export type ExecutionContext = {
  directory: string;
  definition: BenchmarkDefinition;
  runtime: BenchmarkRun["runtime"];
  results: Results;
  onEvent?: ExecutionObserver;
  finalOnly?: boolean;
};
