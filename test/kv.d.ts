/** The root typecheck has no Workers types; this is the slice of KVNamespace the snapshot store uses, so Pages Function modules can be imported by tests. */
interface KVNamespace {
  get<T>(key: string, type: 'json'): Promise<T | null>;
  put(key: string, value: string): Promise<void>;
}
