import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DomainException } from '../../../../../core/exceptions/domain-exceptions';
import { DomainExceptionCode } from '../../../../../core/exceptions/domain-exception-codes';
import { UserRepository } from '../../../user/infrastructure/user.repository';
import { NodemailerService } from '../../../adapters/nodemeiler/nodemeiler.service';
import { EmailService } from '../../../adapters/nodemeiler/ template/email-examples';
import { randomUUID } from 'crypto';
import { add } from 'date-fns';
import { RegistrationEmailResending } from '../../dto/registration-email-resending.input-dto';

export class RegistrationEmailResendingCommand {
  constructor(public dto: RegistrationEmailResending) {}
}

@CommandHandler(RegistrationEmailResendingCommand)
export class RegistrationEmailResendingUseCase
  implements ICommandHandler<RegistrationEmailResendingCommand, void>
{
  constructor(
    private userRepository: UserRepository,
    private nodemailerService: NodemailerService,
    private emailService: EmailService,
  ) {}

  async execute({ dto }: RegistrationEmailResendingCommand): Promise<void> {
    const user = await this.userRepository.findByLoginOrEmail(dto.email);
    if (!user) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        field: 'email',
        message: 'User not found',
      });
    }

    if (user.emailConfirmation.isConfirmed) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        field: 'email',
        message: 'Already confirmed',
      });
    }

    if (new Date(user.emailConfirmation.expirationDate) < new Date()) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        field: 'emailConfirmation.expirationDate',
        message: 'Confirmation time expired',
      });
    }

    const newConfirmationCode = randomUUID();
    const newExpirationDate = add(new Date(), { days: 7 });
    user.updateCodeAndExpirationDate(newConfirmationCode, newExpirationDate);

    await this.userRepository.save(user);

    this.nodemailerService
      .sendEmail(
        user.email,
        newConfirmationCode,
        this.emailService.registrationEmail.bind(this.emailService),
      )
      .catch((er) => console.error('Error in send email:', er));
  }
}
