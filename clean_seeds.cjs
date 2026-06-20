const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clean() {
    await prisma.lineaDeuda.deleteMany({
        where: { id: { startsWith: 'seed-' } }
    });
    await prisma.deuda.deleteMany({
        where: { id: { startsWith: 'seed-' } }
    });
    await prisma.cliente.deleteMany({
        where: { id: { startsWith: 'seed-' } }
    });
    console.log("Seed data deleted.");
}
clean().catch(console.error).finally(() => prisma.$disconnect());
