export class JobStore {
  constructor(prisma) {
    this.prisma = prisma;
  }
  create(data) {
    return this.prisma.audioJob.create({ data });
  }
  get(id) {
    return this.prisma.audioJob.findUnique({ where: { id } });
  }
  countPending() {
    return this.prisma.audioJob.count({
      where: { status: { in: ['QUEUED', 'PROCESSING'] } },
    });
  }
  async claim() {
    const job = await this.prisma.audioJob.findFirst({
      where: { status: 'QUEUED' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (!job) return null;
    const changed = await this.prisma.audioJob.updateMany({
      where: { id: job.id, status: 'QUEUED' },
      data: {
        status: 'PROCESSING',
        startedAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });
    return changed.count ? this.get(job.id) : null;
  }
  updateProcessing(id, data) {
    return this.prisma.audioJob.updateMany({
      where: { id, status: 'PROCESSING' },
      data,
    });
  }
  recover() {
    return this.prisma.audioJob.updateMany({
      where: { status: 'PROCESSING' },
      data: {
        status: 'FAILED',
        errorCode: 'WORKER_INTERRUPTED',
        finishedAt: new Date(),
      },
    });
  }
  cancel(id) {
    return this.prisma.audioJob.updateMany({
      where: { id, status: { notIn: ['CANCELLED', 'EXPIRED'] } },
      data: { status: 'CANCELLED', finishedAt: new Date() },
    });
  }
  expired(now) {
    return this.prisma.audioJob.findMany({
      where: {
        expiresAt: { lte: now },
        status: { notIn: ['PROCESSING', 'EXPIRED'] },
      },
    });
  }
  expire(id) {
    return this.prisma.audioJob.updateMany({
      where: { id, status: { not: 'PROCESSING' } },
      data: { status: 'EXPIRED' },
    });
  }
  all() {
    return this.prisma.audioJob.findMany({
      select: { id: true, status: true },
    });
  }
}
