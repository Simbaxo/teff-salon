import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de tratamiento de datos personales | TEFF Beauty Salon",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">
          Política de tratamiento de datos personales
        </h1>
        <p>TEFF Beauty Salon · Vigente desde el 13 de noviembre de 2026</p>
      </header>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Responsable del tratamiento</h2>
        <p>
          Allure Beauty Group S.A.S., que opera TEFF Beauty Salon, es
          responsable del tratamiento de los datos personales descritos en esta
          política. Su domicilio y dirección de contacto es Cra. 43A #11-73, El
          Poblado, Medellín, Colombia.
        </p>
        <p>
          Correo:{" "}
          <a className="underline" href="mailto:teffglobalgroup@gmail.com">
            teffglobalgroup@gmail.com
          </a>
          {" · "}
          Teléfono:{" "}
          <a className="underline" href="tel:+573505894026">
            +57 350 589 4026
          </a>
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Datos que usamos y para qué</h2>
        <p>
          Tratamos el nombre, los datos de contacto y los datos de la cita que
          proporcionas al reservar. Usamos esta información para gestionar
          reservas, confirmar o cambiar citas, prestar los servicios solicitados
          y responder consultas y reclamos. También conservamos los registros
          asociados a la prestación y el pago del servicio cuando corresponde.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">
          Integración con Google Calendar
        </h2>
        <p>
          Cuando la persona administradora de TEFF autoriza la integración, la
          app usa el permiso de Google Calendar para crear un calendario
          secundario y consultar, crear, actualizar o eliminar eventos en él.
          Allí se sincronizan el nombre del cliente, el servicio, la fecha y
          hora de la cita y la técnica asignada. El calendario se comparte con
          personal autorizado para coordinar la agenda del salón.
        </p>
        <p>
          TEFF guarda el identificador del calendario y una credencial de
          actualización cifrada para mantener la sincronización cuando la
          persona administradora no está conectada. Usamos los datos obtenidos
          de Google únicamente para operar esta integración. La cuenta que
          autorizó el acceso puede revocarlo desde{" "}
          <a
            className="underline"
            href="https://myaccount.google.com/connections"
          >
            Conexiones de la Cuenta de Google
          </a>
          . Para solicitar la eliminación de la conexión guardada en TEFF,
          escribe al correo de contacto.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Conservación y acceso</h2>
        <p>
          Conservamos los datos durante el tiempo necesario para las finalidades
          descritas y el cumplimiento de las obligaciones legales aplicables. El
          acceso se limita al personal y a los proveedores tecnológicos que lo
          necesitan para operar la plataforma, almacenar los datos o sincronizar
          la agenda.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">
          Tus derechos y cómo ejercerlos
        </h2>
        <p>
          Puedes conocer, actualizar y rectificar tus datos, solicitar prueba de
          la autorización cuando corresponda, preguntar cómo se han usado y
          acceder gratuitamente a ellos. También puedes solicitar su supresión o
          revocar la autorización cuando proceda.
        </p>
        <p>
          Allure Beauty Group S.A.S. atiende las consultas y reclamos en
          teffglobalgroup@gmail.com. Indica tu nombre, un medio de contacto y
          qué datos o solicitud quieres que revisemos. Atenderemos la solicitud
          conforme a los plazos de la Ley 1581 de 2012. Una vez agotado el
          trámite de consulta o reclamo ante TEFF, puedes presentar una queja
          ante la Superintendencia de Industria y Comercio.
        </p>
      </section>
    </main>
  );
}
