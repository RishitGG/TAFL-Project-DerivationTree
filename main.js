// Preset Grammars Library
const PRESETS = {
    custom: { g: "S -> a S b\nS -> a b\nS -> e", t: "aabb" },
    palindrome: {
        g: "S -> a S a\nS -> b S b\nS -> a\nS -> b\nS -> e",
        t: "ababa"
    },
    math: {
        g: "E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id",
        t: "id+id*id"
    },
    parens: {
        g: "S -> ( S ) \nS -> S S \nS -> e",
        t: "(())"
    }
};

function loadPreset() {
    const selector = document.getElementById('presetSelector').value;
    const preset = PRESETS[selector];
    if (preset) {
        document.getElementById('grammar').value = preset.g;
        document.getElementById('targetString').value = preset.t;
        // Auto generate on selection
        if (selector !== 'custom') generate();
    }
}

/**
 * Parses the raw grammar text into an object representation.
 */
function parseGrammar(text) {
    const grammar = {};
    let startSymbol = null;
    const lines = text.split('\n');

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        const parts = line.split('->');
        if (parts.length !== 2) throw new Error("Invalid grammar format. Please use 'LHS -> RHS' format.");

        const lhs = parts[0].trim();
        if (!startSymbol) startSymbol = lhs;

        const rhsOptions = parts[1].split('|').map(opt => opt.trim().split(/\s+/));

        if (!grammar[lhs]) grammar[lhs] = [];
        grammar[lhs].push(...rhsOptions);
    }
    return { grammar, startSymbol };
}

/**
 * Uses Depth-First Search (DFS) to find a valid derivation sequence.
 */
function findDerivation(grammar, startSymbol, target, type) {
    const stack = [{ seq: [startSymbol], history: [] }];
    const MAX_DEPTH = 35; // Depth limit protection

    while (stack.length > 0) {
        const current = stack.pop();

        if (current.history.length > MAX_DEPTH) continue;

        let ntIndex;
        if (type === 'leftmost') {
            ntIndex = current.seq.findIndex(sym => grammar[sym]);
        } else {
            ntIndex = current.seq.findLastIndex(sym => grammar[sym]);
        }

        if (ntIndex === -1) {
            const currentStr = current.seq.filter(s => s !== 'e').join('');
            if (currentStr === target) {
                return current;
            }
            continue;
        }

        const nt = current.seq[ntIndex];
        const rules = grammar[nt];

        for (let i = rules.length - 1; i >= 0; i--) {
            const rule = rules[i];
            const newSeq = [...current.seq];

            newSeq.splice(ntIndex, 1, ...rule);

            stack.push({
                seq: newSeq,
                history: [...current.history, { rule }]
            });
        }
    }
    return null;
}

/**
 * Reconstructs the tree structure for D3 based on the winning DFS history.
 */
function buildTreeData(startSymbol, history, grammar, type) {
    const root = { name: startSymbol };
    const frontier = [root];
    const derivationSteps = [[startSymbol]];

    for (const step of history) {
        let ntIndex;
        if (type === 'leftmost') {
            ntIndex = frontier.findIndex(n => grammar[n.name]);
        } else {
            ntIndex = frontier.findLastIndex(n => grammar[n.name]);
        }

        const ntNode = frontier[ntIndex];
        ntNode.children = step.rule.map(sym => ({ name: sym }));

        frontier.splice(ntIndex, 1, ...ntNode.children);
        derivationSteps.push(frontier.map(n => n.name).filter(n => n !== 'e' || frontier.length === 1));
    }

    return { treeData: root, derivationSteps };
}

/**
 * Renders the tree using D3.js with Zoom/Pan.
 */
function drawTree(treeData) {
    const container = document.getElementById('tree-container');
    container.innerHTML = '';

    const width = container.clientWidth;
    const height = container.clientHeight || 450;

    const svg = d3.select("#tree-container").append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("viewBox", `0 0 ${width} ${height}`);

    const g = svg.append("g");

    const zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
        });

    svg.call(zoom);

    const root = d3.hierarchy(treeData);

    const nodeWidth = 70;
    const nodeHeight = 80;
    const treeLayout = d3.tree().nodeSize([nodeWidth, nodeHeight]);
    treeLayout(root);

    let x0 = Infinity;
    let x1 = -x0;
    let maxDepth = 0;
    root.each(d => {
        if (d.x > x1) x1 = d.x;
        if (d.x < x0) x0 = d.x;
        if (d.depth > maxDepth) maxDepth = d.depth;
    });

    // Links
    g.selectAll(".link")
        .data(root.links())
        .join("path")
        .attr("class", "link")
        .attr("d", d3.linkVertical()
            .x(d => d.x)
            .y(d => d.y));

    // Nodes
    const node = g.selectAll(".node")
        .data(root.descendants())
        .join("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.x},${d.y})`);

    node.append("circle").attr("r", 20);

    node.append("text")
        .attr("dy", "0.31em")
        .attr("x", 0)
        .attr("text-anchor", "middle")
        .text(d => d.data.name === 'e' ? 'ε' : d.data.name);

    // Auto-center and zoom to fit
    const treeWidth = x1 - x0 + nodeWidth * 2;
    const treeHeight = (maxDepth + 1) * nodeHeight + nodeHeight;

    const scale = Math.min(1.2, 0.85 * Math.min(width / treeWidth, height / treeHeight));
    const initialTransform = d3.zoomIdentity
        .translate(width / 2, 60)
        .scale(scale);

    svg.call(zoom.transform, initialTransform);
}

/**
 * Download the current SVG Parse Tree as a file
 */
function exportSVG() {
    const svgElement = document.querySelector('#tree-container svg');
    if (!svgElement) return;

    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgElement);

    // Inject styles directly so the exported SVG looks identical
    const style = `<style>
        .node circle { fill: #0f172a; stroke: #a855f7; stroke-width: 2.5px; }
        .node text { font-family: monospace; font-size: 15px; font-weight: 700; fill: #f8fafc; text-anchor: middle; }
        .link { fill: none; stroke: #475569; stroke-width: 2px; }
    </style>`;

    source = source.replace(/<svg[^>]*>/, match => match + style);

    if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "CFG_Parse_Tree.svg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Main execution function triggered by UI.
 */
function generate() {
    const grammarText = document.getElementById('grammar').value;
    const targetString = document.getElementById('targetString').value.trim();
    const derivationType = document.getElementById('derivationType').value;

    const errorMsg = document.getElementById('error-msg');
    const errorText = document.getElementById('error-text');
    const resultsSequence = document.getElementById('results-sequence');
    const resultsTree = document.getElementById('results-tree');
    const derivationBox = document.getElementById('derivation-output');

    errorMsg.classList.add('hidden');
    resultsSequence.classList.add('hidden');
    resultsTree.classList.add('hidden');

    try {
        const { grammar, startSymbol } = parseGrammar(grammarText);
        const result = findDerivation(grammar, startSymbol, targetString, derivationType);

        if (!result) {
            errorText.textContent = `Could not derive the string "${targetString}". It may not belong to the language, or it exceeds the search depth.`;
            errorMsg.classList.remove('hidden');
            return;
        }

        const { treeData, derivationSteps } = buildTreeData(startSymbol, result.history, grammar, derivationType);

        // Feature: Vertical Step-by-Step Derivation Output
        const symbolMap = s => s === 'e' ? 'ε' : s;
        derivationBox.innerHTML = derivationSteps.map((step, index) => {
            const stepStr = step.map(symbolMap).join(' ');
            if (index === 0) {
                return `<div class="py-1 text-slate-300"><span class="text-slate-500 mr-4">Start:</span> ${stepStr}</div>`;
            }
            return `<div class="py-1 text-teal-400 border-t border-slate-800/50 mt-1 pt-1">
                        <span class="text-slate-500 mr-4 inline-block w-16">Step ${index}:</span>
                        <span class="text-slate-500 mx-2">⇒</span> ${stepStr}
                    </div>`;
        }).join('');

        resultsSequence.classList.remove('hidden');

        // Update UI: D3 Tree
        resultsTree.classList.remove('hidden');
        drawTree(treeData);

    } catch (err) {
        errorText.textContent = err.message;
        errorMsg.classList.remove('hidden');
    }
}

window.onload = () => generate();

window.addEventListener('resize', () => {
    if (!document.getElementById('results-tree').classList.contains('hidden')) {
        generate();
    }
});
