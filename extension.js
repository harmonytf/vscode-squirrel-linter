const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const child_process = require("child_process");
const util = require("util");

let timeout = undefined;
//const configuration = vscode.workspace.getConfiguration("squirrel-linter", undefined);

// https://github.com/TFORevive/tforevive_cpp/tree/master/sqcompiler
let compiler = path.join(__dirname, "r1o", "sqcompiler.exe");

async function exec(process, args, data) {
    return new Promise((resolve, reject) => {
        const child = child_process.spawn(process, args);
        let stderr_data = "";
        child.stderr.on("data", data => stderr_data += data.toString());
        child.on("close", code => {
            if (stderr_data)
                return reject(stderr_data);
            return resolve(code);
        });
        child.stdin.write(data);
        child.stdin.end();
    });
}

function activate(context) {
    const compilerDiagnostics = vscode.languages.createDiagnosticCollection("compiler");
    context.subscriptions.push(compilerDiagnostics);
    subscribeToDocumentChanges(context, compilerDiagnostics);

    function refreshDiagnostics(doc) {
        if (timeout) {
            clearTimeout(timeout);
            timeout = undefined;
        }
        timeout = setTimeout(async function () {
            if (path.extname(doc.fileName) === ".nut") {
                let diagnostics = [];
                //console.log("before");
                /*const output = await exec(`"${compiler}" -multiple`, {
                    input: doc.getText() + "\x04",
                });*/
                let stderr = "";
                let returnCode = "N/A";
                try {
                    returnCode = await exec(compiler, ["-multiple"], doc.getText());
                } catch (e) {
                    stderr = e.toString();
                }
                console.log("Squirrel linted", {stderr, returnCode});
                if (/*output && output.stderr && output.stderr.length*/stderr && stderr.length) {
                    let myArray;
                    const regex = /SCRIPT COMPILE ERROR\: source = \((.*)\) line = \((\d+)\) column = \((\d+)\) error = (.*)/gm;
                    while (myArray = regex.exec(/*err.*/stderr.toString())) {
                        const source = myArray[1];
                        const line = +myArray[2];
                        const column = +myArray[3];
                        const error = myArray[4];
                        let range = new vscode.Range(new vscode.Position(line - 1, column - 1), new vscode.Position(line - 1, column - 1));
                        diagnostics.push(new vscode.Diagnostic(range, error, vscode.DiagnosticSeverity.Error));
                    }
                }
                compilerDiagnostics.set(doc.uri, diagnostics);
                fs.promises.readdir(path.join(__dirname, "r1o"))
                    .then(d => {
                        d.filter(f => /tfo_(stage)?log_.*\.log$/.test(f))
                        .forEach(f => fs.promises.unlink(path.join(__dirname, "r1o", f)));
                    });
            }
        }, 300);
    }

    function subscribeToDocumentChanges(context, compilerDiagnostics) {
        if (vscode.window.activeTextEditor) {
            refreshDiagnostics(vscode.window.activeTextEditor.document);
        }

        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor) {
                    refreshDiagnostics(editor.document);
                }
            })
        );

        context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
            refreshDiagnostics(e.document);
        }));

        context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc =>
            compilerDiagnostics.delete(doc.uri))
        );
    }
}

function deactivate() { }

module.exports = {
    activate,
    deactivate
}
