// Type augmentation for graphology DirectedGraph
// The official graphology types are incomplete, so we augment them here

declare module 'graphology' {
  export interface AbstractGraph<NodeAttributes = any, EdgeAttributes = any, GraphAttributes = any> {
    // Node methods
    addNode(node: string, attributes?: NodeAttributes): string;
    hasNode(node: string): boolean;
    updateNode(node: string, updater: (attr: NodeAttributes) => NodeAttributes): void;
    getNodeAttributes(node: string): NodeAttributes;
    dropNode(node: string): void;
    nodes(): IterableIterator<string>;
    forEachNode(callback: (node: string, attributes: NodeAttributes) => void): void;
    
    // Edge methods
    addEdge(source: string, target: string, attributes?: EdgeAttributes): string;
    addEdgeWithKey(key: string, source: string, target: string, attributes?: EdgeAttributes): string;
    hasEdge(edge: string): boolean;
    replaceEdgeAttributes(edge: string, attributes: EdgeAttributes): void;
    getEdgeAttributes(edge: string): EdgeAttributes;
    edges(): IterableIterator<string>;
    inEdges(node: string): string[];
    outEdges(node: string): string[];
    
    // Graph properties
    order: number;
    size: number;
    
    // Degree methods
    degree(node: string): number;
    inDegree(node: string): number;
    outDegree(node: string): number;
    
    // Clear
    clear(): void;
  }

  export default class DirectedGraph<NodeAttributes = any, EdgeAttributes = any, GraphAttributes = any> 
    implements AbstractGraph<NodeAttributes, EdgeAttributes, GraphAttributes> {
    constructor(options?: any);
    
    // Node methods
    addNode(node: string, attributes?: NodeAttributes): string;
    hasNode(node: string): boolean;
    updateNode(node: string, updater: (attr: NodeAttributes) => NodeAttributes): void;
    getNodeAttributes(node: string): NodeAttributes;
    dropNode(node: string): void;
    nodes(): IterableIterator<string>;
    forEachNode(callback: (node: string, attributes: NodeAttributes) => void): void;
    
    // Edge methods
    addEdge(source: string, target: string, attributes?: EdgeAttributes): string;
    addEdgeWithKey(key: string, source: string, target: string, attributes?: EdgeAttributes): string;
    hasEdge(edge: string): boolean;
    replaceEdgeAttributes(edge: string, attributes: EdgeAttributes): void;
    getEdgeAttributes(edge: string): EdgeAttributes;
    edges(): IterableIterator<string>;
    inEdges(node: string): string[];
    outEdges(node: string): string[];
    
    // Graph properties
    order: number;
    size: number;
    
    // Degree methods
    degree(node: string): number;
    inDegree(node: string): number;
    outDegree(node: string): number;
    
    // Clear
    clear(): void;
  }

  export class Graph<NodeAttributes = any, EdgeAttributes = any, GraphAttributes = any> 
    implements AbstractGraph<NodeAttributes, EdgeAttributes, GraphAttributes> {
    constructor(options?: any);
    
    // Node methods
    addNode(node: string, attributes?: NodeAttributes): string;
    hasNode(node: string): boolean;
    updateNode(node: string, updater: (attr: NodeAttributes) => NodeAttributes): void;
    getNodeAttributes(node: string): NodeAttributes;
    dropNode(node: string): void;
    nodes(): IterableIterator<string>;
    forEachNode(callback: (node: string, attributes: NodeAttributes) => void): void;
    
    // Edge methods
    addEdge(source: string, target: string, attributes?: EdgeAttributes): string;
    addEdgeWithKey(key: string, source: string, target: string, attributes?: EdgeAttributes): string;
    hasEdge(edge: string): boolean;
    replaceEdgeAttributes(edge: string, attributes: EdgeAttributes): void;
    getEdgeAttributes(edge: string): EdgeAttributes;
    edges(): IterableIterator<string>;
    inEdges(node: string): string[];
    outEdges(node: string): string[];
    
    // Graph properties
    order: number;
    size: number;
    
    // Degree methods
    degree(node: string): number;
    inDegree(node: string): number;
    outDegree(node: string): number;
    
    // Clear
    clear(): void;
  }
}
