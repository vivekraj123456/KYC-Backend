const prisma = require('./src/config/db');

async function checkLogs() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { timestamp: 'desc' },
    take: 10
  });
  console.log(JSON.stringify(logs, null, 2));
}

checkLogs();
