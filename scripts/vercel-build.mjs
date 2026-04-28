import { execSync } from "node:child_process";

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, {
    stdio: "inherit",
    shell: true,
  });
}

run("prisma db push --schema=prisma/schema.prisma");
run("prisma generate --schema=prisma/schema.prisma");

if (process.env.DEMO_MODE === "true") {
  run("tsx prisma/seed.ts");
}

run("next build");
