import { ForbiddenException, Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Block } from './block.entity';
import { Report } from './report.entity';
import { UsersService } from '../users/users.service';
import { DiscoverService } from '../discover/discover.service';

@Injectable()
export class ModerationService {
  private readonly BAN_THRESHOLD = 3;

  constructor(
    @InjectRepository(Block)
    private readonly blockRepo: Repository<Block>,
    @InjectRepository(Report)
    private readonly reportRepo: Repository<Report>,
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => DiscoverService))
    private readonly discoverService: DiscoverService,
  ) {}

  async block(blockerId: number, blockedId: number): Promise<Block> {
    if (blockerId === blockedId) {
      throw new ForbiddenException('Cannot block yourself');
    }
    const [blocker, blocked] = await Promise.all([
      this.usersService.findOne(blockerId),
      this.usersService.findOne(blockedId),
    ]);

    let block = await this.blockRepo.findOne({
      where: { blockerId, blockedId },
    });
    if (!block) {
      block = this.blockRepo.create({
        blocker,
        blocked,
        blockerId,
        blockedId,
      });
      block = await this.blockRepo.save(block);
    }

    // Invalidate discovery pool cache on block
    this.discoverService.invalidate(blockerId);
    this.discoverService.regenerateForUser(blockerId).catch(() => null);

    return block;
  }

  async report(reporterId: number, reportedId: number, reason: string): Promise<Report> {
    if (reporterId === reportedId) {
      throw new ForbiddenException('Cannot report yourself');
    }
    const [reporter, reported] = await Promise.all([
      this.usersService.findOne(reporterId),
      this.usersService.findOne(reportedId),
    ]);

    let isNewReport = false;
    let report = await this.reportRepo.findOne({
      where: { reporterId, reportedId },
    });
    if (!report) {
      report = this.reportRepo.create({
        reporter,
        reported,
        reporterId,
        reportedId,
        reason,
      });
      report = await this.reportRepo.save(report);
      isNewReport = true;
    }

    if (isNewReport && reported.accountStatus === 'active') {
      reported.reportCount += 1;
      let newStatus = reported.accountStatus;
      
      if (reported.reportCount >= this.BAN_THRESHOLD) {
        newStatus = 'banned' as any;
        this.discoverService.invalidate(reportedId);
      }

      await this.usersService.updateInternal(reportedId, {
        accountStatus: newStatus,
        reportCount: reported.reportCount,
      });

      
    }

    return report;
  }
}
