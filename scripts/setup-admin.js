const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { randomBytes, scryptSync } = require("crypto");

const envPath = path.join(__dirname, "..", ".env");

const ask = (question) => new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
    });
});

const askHidden = (question) => new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
        reject(new Error("Este comando necesita una terminal interactiva."));
        return;
    }

    let value = "";
    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const cleanup = () => {
        process.stdin.removeListener("data", onData);
        process.stdin.setRawMode(false);
        process.stdin.pause();
    };

    const onData = (chunk) => {
        for (const character of chunk) {
            if (character === "\u0003") {
                cleanup();
                process.stdout.write("\n");
                reject(new Error("Configuración cancelada."));
                return;
            }

            if (character === "\r" || character === "\n") {
                cleanup();
                process.stdout.write("\n");
                resolve(value);
                return;
            }

            if (character === "\u007f" || character === "\b") {
                if (value.length > 0) {
                    value = value.slice(0, -1);
                    process.stdout.write("\b \b");
                }
                continue;
            }

            if (character >= " ") {
                value += character;
                process.stdout.write("*");
            }
        }
    };

    process.stdin.on("data", onData);
});

const upsertEnv = (content, key, value) => {
    const lines = content ? content.replace(/\r\n/g, "\n").split("\n") : [];
    const index = lines.findIndex((line) => new RegExp(`^${key}\\s*=`).test(line));
    const newLine = `${key}=${value}`;

    if (index === -1) lines.push(newLine);
    else lines[index] = newLine;

    return lines.filter((line, lineIndex) => line || lineIndex < lines.length - 1).join("\n");
};

const main = async () => {
    console.log("\nConfiguración segura del administrador de Solnatura\n");

    const username = await ask("Usuario administrador [admin]: ") || "admin";
    const password = await askHidden("Contraseña (mínimo 6 caracteres): ");
    const confirmation = await askHidden("Repite la contraseña: ");

    if (password.length < 6) {
        throw new Error("La contraseña debe tener al menos 6 caracteres.");
    }

    if (password !== confirmation) {
        throw new Error("Las contraseñas no coinciden.");
    }

    const salt = randomBytes(16);
    const passwordHash = scryptSync(password, salt, 64);
    const sessionSecret = randomBytes(48).toString("base64url");

    let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
    env = upsertEnv(env, "ADMIN_USERNAME", JSON.stringify(username));
    env = upsertEnv(env, "ADMIN_PASSWORD_HASH", `scrypt$${salt.toString("hex")}$${passwordHash.toString("hex")}`);
    env = upsertEnv(env, "ADMIN_SESSION_SECRET", sessionSecret);
    fs.writeFileSync(envPath, `${env.trimEnd()}\n`, { mode: 0o600 });

    console.log("\nAdministrador configurado en .env.");
    console.log("Reinicia el servidor para habilitar el acceso a /mode.\n");
};

main().catch((err) => {
    console.error(`\nError: ${err.message}\n`);
    process.exitCode = 1;
});
