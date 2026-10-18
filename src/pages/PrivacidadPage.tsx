import type { ReactNode } from 'react';
import { PageShell } from '@/components/club/PageShell';
import { siteConfig } from '@/data/site';

// Texto base. Los datos marcados como PENDIENTE (titular, NIF, email) hay que completarlos,
// y conviene que lo revise un profesional antes de publicarlo como definitivo.

function Pending({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {children} <span className="pend-badge">PENDIENTE</span>
    </span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-[1.5rem] font-semibold text-vino">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-carbon/85 sm:text-[0.95rem]">{children}</div>
    </section>
  );
}

export function PrivacidadPage() {
  return (
    <PageShell>
      <article className="mx-auto max-w-[720px] animate-fade-in">
        <div className="eyebrow text-vino">Club La Alameda</div>
        <h1 className="mt-3 font-display text-[2.2rem] font-semibold leading-tight text-vino sm:text-[2.8rem]">
          Política de privacidad
        </h1>
        <div className="divider-gold my-5 ml-0" />
        <p className="text-sm leading-relaxed text-carbon/80 sm:text-[0.95rem]">
          En La Alameda cuidamos tus datos igual que cuidamos a quienes vienen al bar. Aquí te contamos, sin letra
          pequeña, qué datos recogemos cuando te unes a nuestro club de clientes y para qué los usamos, conforme al
          Reglamento General de Protección de Datos (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD).
        </p>

        <Section title="1. Responsable del tratamiento">
          <ul className="space-y-1.5">
            <li>
              <strong>Titular:</strong> <Pending>[Nombre o razón social]</Pending>
            </li>
            <li>
              <strong>NIF/CIF:</strong> <Pending>[NIF]</Pending>
            </li>
            <li>
              <strong>Establecimiento:</strong> {siteConfig.name}, {siteConfig.address}
            </li>
            <li>
              <strong>Email de contacto:</strong> <Pending>[email de privacidad]</Pending>
            </li>
            <li>
              <strong>Teléfono:</strong> {siteConfig.phoneDisplay}
            </li>
          </ul>
        </Section>

        <Section title="2. Qué datos recogemos">
          <p>
            Al registrarte: tu nombre, email y contraseña (la contraseña se guarda cifrada y nadie del bar puede verla).
            Si decides añadirlos en tu perfil: teléfono y fecha de cumpleaños. También guardamos qué comunicaciones has
            aceptado recibir y cuándo aceptaste esta política.
          </p>
        </Section>

        <Section title="3. Para qué los usamos">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Gestionar tu cuenta del club y permitirte acceder a tu perfil.</li>
            <li>
              Enviarte ofertas, eventos y novedades de La Alameda <strong>solo por los canales que hayas aceptado</strong>{' '}
              (email y/o WhatsApp).
            </li>
            <li>Si nos das tu cumpleaños, felicitarte y ofrecerte alguna sorpresa.</li>
          </ul>
          <p>No elaboramos perfiles automatizados ni vendemos ni cedemos tus datos a terceros para su publicidad.</p>
        </Section>

        <Section title="4. Base legal">
          <p>
            La gestión de tu cuenta se basa en tu solicitud de alta en el club. Las comunicaciones comerciales se basan
            en tu consentimiento, que es independiente para cada canal y puedes retirar en cualquier momento desde tu
            perfil sin que afecte a tu cuenta.
          </p>
        </Section>

        <Section title="5. Cuánto tiempo los guardamos">
          <p>
            Mientras sigas en el club. Si borras tu cuenta, tus datos se eliminan de forma inmediata y definitiva, salvo
            que una ley nos obligue a conservar alguno durante un plazo determinado.
          </p>
        </Section>

        <Section title="6. Quién más accede a ellos">
          <p>
            Usamos Supabase como proveedor de alojamiento de la base de datos y de la gestión de cuentas, con servidores
            en la Unión Europea. Actúa como encargado del tratamiento y solo trata los datos siguiendo nuestras
            instrucciones. Si en el futuro usamos un servicio de envío de correos o de WhatsApp, lo hará en las mismas
            condiciones.
          </p>
        </Section>

        <Section title="7. Tus derechos">
          <p>
            Puedes acceder a tus datos, corregirlos, pedir que los borremos, oponerte a su uso, limitarlo o pedir su
            portabilidad. La mayoría puedes ejercerlos tú directamente desde <strong>Mi perfil</strong>, donde también
            puedes borrar tu cuenta. Para lo demás, escríbenos al email de contacto indicado arriba.
          </p>
          <p>
            Si crees que no hemos tratado bien tus datos, puedes reclamar ante la Agencia Española de Protección de
            Datos (
            <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" className="font-semibold text-vino underline">
              www.aepd.es
            </a>
            ).
          </p>
        </Section>

        <p className="mt-10 text-xs text-carbon/55">Última actualización: octubre de 2026.</p>
      </article>
    </PageShell>
  );
}
