

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."find_duplicate_emails"() RETURNS TABLE("email" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.email
    FROM
        public.candidatos p
    WHERE
        p.email IS NOT NULL AND p.email != ''
    GROUP BY
        p.email
    HAVING
        COUNT(*) > 1;
END;
$$;


ALTER FUNCTION "public"."find_duplicate_emails"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_duplicate_hashes"() RETURNS TABLE("content_hash" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.content_hash
    FROM
        public.candidatos c
    WHERE
        c.content_hash IS NOT NULL
    GROUP BY
        c.content_hash
    HAVING
        COUNT(*) > 1;
END;
$$;


ALTER FUNCTION "public"."find_duplicate_hashes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_candidate_counts_by_folder"() RETURNS TABLE("carpeta_id" bigint, "count" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.carpeta_id,
        COUNT(c.id)
    FROM
        v2_candidatos c
    WHERE
        c.carpeta_id IS NOT NULL
    GROUP BY
        c.carpeta_id;
END;
$$;


ALTER FUNCTION "public"."get_candidate_counts_by_folder"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_candidatos_with_folder_path"() RETURNS TABLE("id" bigint, "created_at" timestamp with time zone, "carpeta_id" bigint, "nombre_archivo" "text", "base64" "text", "texto_cv" "text", "nombre_candidato" "text", "email" "text", "telefono" "text", "resumen" "text", "folder_path" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE folder_path_cte AS (
        SELECT
            c.id, c.nombre, c.parent_id, c.nombre::TEXT AS path
        FROM public.carpetas c WHERE c.parent_id IS NULL
        UNION ALL
        SELECT
            c.id, c.nombre, c.parent_id, fp.path || ' / ' || c.nombre
        FROM public.carpetas c JOIN folder_path_cte fp ON c.parent_id = fp.id
    )
    SELECT
        cand.id,
        cand.created_at,
        cand.carpeta_id,
        cand.nombre_archivo,
        cand.base64,
        cand.texto_cv,
        cand.nombre_candidato,
        cand.email,
        cand.telefono,
        cand.resumen, -- Añadido para el análisis de IA
        fp.path AS folder_path
    FROM
        public.candidatos cand
    LEFT JOIN
        folder_path_cte fp ON cand.carpeta_id = fp.id;
END;
$$;


ALTER FUNCTION "public"."get_candidatos_with_folder_path"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_organization_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN (
        SELECT organization_id
        FROM public.saas_user_roles
        WHERE user_id = auth.uid()
        LIMIT 1
    );
END;
$$;


ALTER FUNCTION "public"."get_current_organization_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_cv"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  organization_id UUID;
  file_path TEXT;
  file_name TEXT;
BEGIN
  -- Nos aseguramos de que la función solo se ejecute para archivos en nuestro bucket 'cv-uploads'.
  IF new.bucket_id = 'cv-uploads' THEN
    
    -- Extraemos el ID de la organización de la ruta del archivo.
    -- La ruta tiene el formato: "uuid-de-la-organizacion/timestamp-nombre-archivo.pdf"
    organization_id := (split_part(new.name, '/', 1))::uuid;
    
    -- Obtenemos solo el nombre original del archivo
    file_name := (regexp_matches(new.name, '.*/(.*?)$'))[1];

    -- Guardamos la ruta completa del archivo en Supabase Storage
    file_path := new.name;

    -- Insertamos una nueva fila en la tabla 'saas_candidates' con el estado inicial.
    -- El nombre 'Candidato a procesar...' es temporal hasta que la IA lo analice.
    INSERT INTO public.saas_candidates (organization_id, cv_filename_main, cv_storage_path_main, full_name)
    VALUES (organization_id, file_name, file_path, 'Candidato a procesar...');
    
  END IF;
  
  RETURN new;
END;
$_$;


ALTER FUNCTION "public"."handle_new_cv"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_postulacion"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Llama a la Edge Function 'process-new-postulaciones' de forma asíncrona.
  -- Esta llamada no bloqueará la inserción de la postulación.
  PERFORM net.http_post(
      -- Asegúrate de que esta URL coincida con la de tu proyecto y el nombre de la función.
      url := 'https://czocbnyoenjbpxmcqobn.supabase.co/functions/v1/process-new-postulaciones',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NDI5MTMsImV4cCI6MjA2ODQxODkxM30.pNgJnwAY8uxb6yCQilJfD92VNwsCkntr4Ie_os2lI44"}'::jsonb,
      -- Envía el ID de la nueva postulación en un array, como espera la función.
      body := jsonb_build_object('postulaciones', array[NEW.id])
  );
  
  -- Devuelve el registro de la nueva postulación para completar la operación de INSERT.
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_postulacion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.app_saas_users (id)
  VALUES (new.id);
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_submission"("p_email" "text", "p_nombre" "text", "p_telefono" "text", "p_aviso_id" bigint, "p_base64_cv" "text", "p_texto_cv" "text", "p_nombre_archivo" "text", "p_carpeta_id" bigint DEFAULT NULL::bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_perfil_id BIGINT;
BEGIN
    -- Busca el perfil por email. Si no existe, lo crea. Si existe, lo actualiza.
    INSERT INTO public.perfiles (email, nombre_candidato, telefono, texto_cv_general, base64_general, nombre_archivo_general, carpeta_id)
    VALUES (p_email, p_nombre, p_telefono, p_texto_cv, p_base64_cv, p_nombre_archivo, p_carpeta_id)
    ON CONFLICT (email) DO UPDATE 
    SET 
        nombre_candidato = COALESCE(p_nombre, perfiles.nombre_candidato),
        telefono = COALESCE(p_telefono, perfiles.telefono),
        texto_cv_general = p_texto_cv,
        base64_general = p_base64_cv,
        nombre_archivo_general = p_nombre_archivo,
        carpeta_id = COALESCE(p_carpeta_id, perfiles.carpeta_id)
    RETURNING id INTO v_perfil_id;

    -- Si se proporcionó un ID de aviso, crea o actualiza la postulación.
    IF p_aviso_id IS NOT NULL THEN
        INSERT INTO public.postulaciones (aviso_id, perfil_id, base64_cv, texto_cv, nombre_archivo)
        VALUES (p_aviso_id, v_perfil_id, p_base64_cv, p_texto_cv, p_nombre_archivo)
        ON CONFLICT (perfil_id, aviso_id) DO UPDATE
        SET
            base64_cv = EXCLUDED.base64_cv,
            texto_cv = EXCLUDED.texto_cv,
            nombre_archivo = EXCLUDED.nombre_archivo,
            calificacion = NULL, -- Resetea la calificación para que el cliente la re-analice
            resumen = NULL;
    END IF;
END;
$$;


ALTER FUNCTION "public"."handle_submission"("p_email" "text", "p_nombre" "text", "p_telefono" "text", "p_aviso_id" bigint, "p_base64_cv" "text", "p_texto_cv" "text", "p_nombre_archivo" "text", "p_carpeta_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."importar_candidatos_a_aviso"("target_aviso_id" integer, "source_candidato_ids" integer[]) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    candidate_record RECORD;
BEGIN
    -- El bucle FOREACH ahora ejecuta la consulta SELECT entre paréntesis,
    -- que es la sintaxis correcta en plpgsql.
    FOR candidate_record IN (SELECT * FROM app_saas_candidatos WHERE id = ANY(source_candidato_ids))
    LOOP
        -- Insertamos una nueva postulación para el aviso actual,
        -- reutilizando la información del CV que ya está en la base de talentos.
        INSERT INTO app_saas_postulaciones (
            aviso_id,
            candidato_id,
            base64_cv_especifico,
            texto_cv_especifico,
            nombre_archivo_especifico
        )
        VALUES (
            target_aviso_id,
            candidate_record.id,
            candidate_record.base64_general,
            candidate_record.texto_cv_general,
            candidate_record.nombre_archivo_general
        )
        -- Si el candidato ya existía en este aviso, no hacemos nada para evitar duplicados.
        ON CONFLICT (aviso_id, candidato_id) DO NOTHING;
    END LOOP;
END;
$$;


ALTER FUNCTION "public"."importar_candidatos_a_aviso"("target_aviso_id" integer, "source_candidato_ids" integer[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_applications_count"("posting_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  update public.saas_job_postings
  set applications_count = applications_count + 1
  where id = posting_id;
end;
$$;


ALTER FUNCTION "public"."increment_applications_count"("posting_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_applications_count"("posting_id" bigint, "increment_by" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  update public.saas_job_postings
  set applications_count = applications_count + increment_by
  where id = posting_id;
end;
$$;


ALTER FUNCTION "public"."increment_applications_count"("posting_id" bigint, "increment_by" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_cv_read_count"("user_id_param" "uuid", "increment_value" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.APP_SAAS_USERS
  SET cv_read_count = cv_read_count + increment_value
  WHERE id = user_id_param;
END;
$$;


ALTER FUNCTION "public"."increment_cv_read_count"("user_id_param" "uuid", "increment_value" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_postulaciones_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Actualiza la tabla de avisos, incrementando en 1 el contador
  -- del aviso específico que recibió la nueva postulación (NEW.aviso_id).
  UPDATE public.app_saas_avisos
  SET postulaciones_count = postulaciones_count + 1
  WHERE id = NEW.aviso_id;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."increment_postulaciones_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_process_cv_on_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Llama a la Edge Function 'process-cv' de forma asíncrona
    -- pasándole el nuevo registro (la fila que se insertó o actualizó)
    PERFORM net.http_post(
        url:='https://czocbnyoenjbpxmcqobn.supabase.co/functions/v1/process-cv',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NDI5MTMsImV4cCI6MjA2ODQxODkxM30.pNgJnwAY8uxb6yCQilJfD92VNwsCkntr4Ie_os2lI44"}'::jsonb,
        body:=json_build_object('record', NEW)
    );
    
    -- CORRECCIÓN CLAVE: Para un trigger de tipo AFTER, se debe devolver NULL
    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."trigger_process_cv_on_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_postulaciones_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.v2_avisos
    SET postulaciones_count = postulaciones_count + 1
    WHERE id = NEW.aviso_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.v2_avisos
    SET postulaciones_count = postulaciones_count - 1
    WHERE id = OLD.aviso_id;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_postulaciones_count"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."COPIA AVISOS" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "titulo" "text" NOT NULL,
    "descripcion" "text",
    "max_cv" integer,
    "valido_hasta" "date",
    "condiciones_necesarias" "text"[],
    "condiciones_deseables" "text"[]
);


ALTER TABLE "public"."COPIA AVISOS" OWNER TO "postgres";


COMMENT ON TABLE "public"."COPIA AVISOS" IS 'This is a duplicate of avisos';



ALTER TABLE "public"."COPIA AVISOS" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."COPIA AVISOS_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."COPIA CANDIDATOS" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "carpeta_id" bigint,
    "nombre_archivo" "text",
    "base64" "text",
    "texto_cv" "text",
    "nombre_candidato" "text",
    "email" "text",
    "telefono" "text",
    "content_hash" "text"
);


ALTER TABLE "public"."COPIA CANDIDATOS" OWNER TO "postgres";


COMMENT ON TABLE "public"."COPIA CANDIDATOS" IS 'This is a duplicate of candidatos';



ALTER TABLE "public"."COPIA CANDIDATOS" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."COPIA CANDIDATOS_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."COPIA EVALUACIONES" (
    "id" bigint NOT NULL,
    "candidato_id" bigint,
    "aviso_id" bigint NOT NULL,
    "calificacion" integer,
    "resumen" "text",
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."COPIA EVALUACIONES" OWNER TO "postgres";


COMMENT ON TABLE "public"."COPIA EVALUACIONES" IS 'This is a duplicate of evaluaciones';



ALTER TABLE "public"."COPIA EVALUACIONES" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."COPIA EVALUACIONES_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."app_saas_avisos" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "descripcion" "text",
    "max_cv" integer,
    "valido_hasta" "date",
    "condiciones_necesarias" "text"[],
    "condiciones_deseables" "text"[],
    "postulaciones_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_saas_avisos" OWNER TO "postgres";


ALTER TABLE "public"."app_saas_avisos" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."app_saas_avisos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."app_saas_candidatos" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "nombre_candidato" "text",
    "email" "text",
    "telefono" "text",
    "ubicacion" "text",
    "estado" "text",
    "nombre_archivo_general" "text",
    "base64_general" "text",
    "texto_cv_general" "text",
    "carpeta_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_saas_candidatos" OWNER TO "postgres";


ALTER TABLE "public"."app_saas_candidatos" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."app_saas_candidatos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."app_saas_carpetas" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "parent_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_saas_carpetas" OWNER TO "postgres";


ALTER TABLE "public"."app_saas_carpetas" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."app_saas_carpetas_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."app_saas_import_queue" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "original_file_name" "text" NOT NULL,
    "texto_cv" "text",
    "base64_cv" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "folder_id" bigint
);

ALTER TABLE ONLY "public"."app_saas_import_queue" REPLICA IDENTITY FULL;


ALTER TABLE "public"."app_saas_import_queue" OWNER TO "postgres";


ALTER TABLE "public"."app_saas_import_queue" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."app_saas_import_queue_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."app_saas_invoices" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "plan_name" "text" NOT NULL,
    "amount" integer NOT NULL,
    "status" "text" NOT NULL,
    "invoice_url" "text"
);


ALTER TABLE "public"."app_saas_invoices" OWNER TO "postgres";


ALTER TABLE "public"."app_saas_invoices" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."app_saas_invoices_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."app_saas_notas" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "candidato_id" bigint NOT NULL,
    "postulacion_id" bigint,
    "nota" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_saas_notas" OWNER TO "postgres";


ALTER TABLE "public"."app_saas_notas" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."app_saas_notas_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."app_saas_postulaciones" (
    "id" bigint NOT NULL,
    "aviso_id" bigint NOT NULL,
    "candidato_id" bigint NOT NULL,
    "calificacion" integer,
    "resumen" "text",
    "nombre_archivo_especifico" "text",
    "base64_cv_especifico" "text",
    "texto_cv_especifico" "text",
    "nombre_candidato_snapshot" "text",
    "email_snapshot" "text",
    "telefono_snapshot" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_saas_postulaciones" OWNER TO "postgres";


ALTER TABLE "public"."app_saas_postulaciones" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."app_saas_postulaciones_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."app_saas_users" (
    "id" "uuid" NOT NULL,
    "subscription_plan" "text" DEFAULT 'free'::"text" NOT NULL,
    "cv_read_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "full_name" "text",
    "company_name" "text",
    "notification_preferences" "jsonb" DEFAULT '{}'::"jsonb",
    "stripe_customer_id" "text",
    "theme" "text" DEFAULT 'light'::"text",
    "mercadopago_customer_id" "text",
    "mercadopago_subscription_id" "text",
    "username" "text",
    "website" "text",
    "bio" "text",
    "stripe_subscription_id" "text"
);


ALTER TABLE "public"."app_saas_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."avisos" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "titulo" "text" NOT NULL,
    "descripcion" "text",
    "max_cv" integer,
    "valido_hasta" "date",
    "condiciones_necesarias" "text"[],
    "condiciones_deseables" "text"[]
);


ALTER TABLE "public"."avisos" OWNER TO "postgres";


ALTER TABLE "public"."avisos" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."avisos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."candidatos" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "carpeta_id" bigint,
    "nombre_archivo" "text",
    "base64" "text",
    "texto_cv" "text",
    "nombre_candidato" "text",
    "email" "text",
    "telefono" "text",
    "content_hash" "text"
);


ALTER TABLE "public"."candidatos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."candidatos_duplicate" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "carpeta_id" bigint,
    "nombre_archivo" "text",
    "base64" "text",
    "texto_cv" "text",
    "nombre_candidato" "text",
    "email" "text",
    "telefono" "text",
    "content_hash" "text"
);


ALTER TABLE "public"."candidatos_duplicate" OWNER TO "postgres";


COMMENT ON TABLE "public"."candidatos_duplicate" IS 'This is a duplicate of candidatos';



ALTER TABLE "public"."candidatos_duplicate" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."candidatos_duplicate_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."candidatos" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."candidatos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."carpetas" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nombre" "text" NOT NULL,
    "parent_id" bigint
);


ALTER TABLE "public"."carpetas" OWNER TO "postgres";


ALTER TABLE "public"."carpetas" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."carpetas_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."evaluaciones" (
    "id" bigint NOT NULL,
    "candidato_id" bigint,
    "aviso_id" bigint NOT NULL,
    "calificacion" integer,
    "resumen" "text",
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."evaluaciones" OWNER TO "postgres";


COMMENT ON TABLE "public"."evaluaciones" IS 'Almacena la calificación y análisis de un candidato para un aviso específico.';



CREATE TABLE IF NOT EXISTS "public"."evaluaciones_duplicate" (
    "id" bigint NOT NULL,
    "candidato_id" bigint,
    "aviso_id" bigint NOT NULL,
    "calificacion" integer,
    "resumen" "text",
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."evaluaciones_duplicate" OWNER TO "postgres";


COMMENT ON TABLE "public"."evaluaciones_duplicate" IS 'This is a duplicate of evaluaciones';



ALTER TABLE "public"."evaluaciones_duplicate" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."evaluaciones_duplicate_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."evaluaciones" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."evaluaciones_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."perfiles" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nombre_candidato" "text",
    "email" "text",
    "telefono" "text",
    "texto_cv" "text",
    "base64" "text",
    "nombre_archivo" "text",
    "carpeta_id" bigint,
    "texto_cv_general" "text",
    "nombre_archivo_general" "text",
    "base64_general" "text"
);


ALTER TABLE "public"."perfiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."perfiles" IS 'Almacena perfiles únicos de candidatos, identificados por email.';



ALTER TABLE "public"."perfiles" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."perfiles_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."postulaciones" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "aviso_id" bigint NOT NULL,
    "perfil_id" bigint NOT NULL,
    "nombre_archivo" "text",
    "calificacion" integer DEFAULT '-2'::integer NOT NULL,
    "resumen" "text",
    "notas" "text",
    "base64_cv" "text",
    "texto_cv" "text"
);


ALTER TABLE "public"."postulaciones" OWNER TO "postgres";


COMMENT ON TABLE "public"."postulaciones" IS 'Registra la postulación de un Perfil a un Aviso específico.';



ALTER TABLE "public"."postulaciones" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."postulaciones_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."procesamiento_cvs" (
    "id" bigint NOT NULL,
    "nombre_archivo" character varying(255),
    "ruta_archivo" character varying(255),
    "estado" character varying(50) DEFAULT 'pendiente'::character varying,
    "mensaje_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."procesamiento_cvs" OWNER TO "postgres";


COMMENT ON TABLE "public"."procesamiento_cvs" IS 'Tabla para gestionar el procesamiento en segundo plano de los CVs.';



ALTER TABLE "public"."procesamiento_cvs" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."procesamiento_cvs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."v2_avisos" (
    "id" bigint NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "titulo" "text" NOT NULL,
    "descripcion" "text",
    "max_cv" integer,
    "valido_hasta" "date",
    "condiciones_necesarias" "text"[],
    "condiciones_deseables" "text"[],
    "postulaciones_count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."v2_avisos" OWNER TO "postgres";


COMMENT ON TABLE "public"."v2_avisos" IS 'V2: Almacena los avisos o búsquedas laborales creadas por los usuarios.';



ALTER TABLE "public"."v2_avisos" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."v2_avisos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."v2_candidatos" (
    "id" bigint NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text" NOT NULL,
    "nombre_candidato" "text",
    "telefono" "text",
    "nombre_archivo_general" "text",
    "base64_general" "text",
    "texto_cv_general" "text",
    "carpeta_id" bigint,
    "cv_url" "text",
    "estado" "text",
    "ubicacion" "text"
);


ALTER TABLE "public"."v2_candidatos" OWNER TO "postgres";


COMMENT ON TABLE "public"."v2_candidatos" IS 'V2: Almacena perfiles ÚNICOS de candidatos. El email es la clave para evitar duplicados.';



ALTER TABLE "public"."v2_candidatos" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."v2_candidatos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."v2_carpetas" (
    "id" bigint NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nombre" "text" NOT NULL,
    "parent_id" bigint
);


ALTER TABLE "public"."v2_carpetas" OWNER TO "postgres";


COMMENT ON TABLE "public"."v2_carpetas" IS 'V2: Almacena las carpetas para organizar candidatos en la Base de Talentos.';



ALTER TABLE "public"."v2_carpetas" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."v2_carpetas_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."v2_notas_historial" (
    "id" bigint NOT NULL,
    "candidato_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nota" "text"
);


ALTER TABLE "public"."v2_notas_historial" OWNER TO "postgres";


ALTER TABLE "public"."v2_notas_historial" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."v2_notas_historial_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."v2_postulaciones" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "candidato_id" bigint,
    "aviso_id" bigint NOT NULL,
    "calificacion" integer,
    "resumen" "text",
    "notas" "text",
    "base64_cv_especifico" "text",
    "texto_cv_especifico" "text",
    "nombre_candidato_snapshot" "text",
    "email_snapshot" "text",
    "telefono_snapshot" "text",
    "nombre_archivo_especifico" "text"
);


ALTER TABLE "public"."v2_postulaciones" OWNER TO "postgres";


COMMENT ON TABLE "public"."v2_postulaciones" IS 'V2.1: Registra la postulación de un candidato. Guarda un snapshot de los datos para que el registro histórico sea inmutable, incluso si el candidato es eliminado de la base de talentos.';



COMMENT ON COLUMN "public"."v2_postulaciones"."nombre_archivo_especifico" IS 'El nombre del archivo PDF que el candidato subió para esta postulación específica.';



ALTER TABLE "public"."v2_postulaciones" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."v2_postulaciones_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."COPIA AVISOS"
    ADD CONSTRAINT "COPIA AVISOS_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."COPIA CANDIDATOS"
    ADD CONSTRAINT "COPIA CANDIDATOS_content_hash_key" UNIQUE ("content_hash");



ALTER TABLE ONLY "public"."COPIA CANDIDATOS"
    ADD CONSTRAINT "COPIA CANDIDATOS_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."COPIA EVALUACIONES"
    ADD CONSTRAINT "COPIA EVALUACIONES_candidato_id_aviso_id_key" UNIQUE ("candidato_id", "aviso_id");



ALTER TABLE ONLY "public"."COPIA EVALUACIONES"
    ADD CONSTRAINT "COPIA EVALUACIONES_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_saas_avisos"
    ADD CONSTRAINT "app_saas_avisos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_saas_candidatos"
    ADD CONSTRAINT "app_saas_candidatos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_saas_carpetas"
    ADD CONSTRAINT "app_saas_carpetas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_saas_import_queue"
    ADD CONSTRAINT "app_saas_import_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_saas_invoices"
    ADD CONSTRAINT "app_saas_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_saas_notas"
    ADD CONSTRAINT "app_saas_notas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_saas_postulaciones"
    ADD CONSTRAINT "app_saas_postulaciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_saas_users"
    ADD CONSTRAINT "app_saas_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."avisos"
    ADD CONSTRAINT "avisos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."candidatos"
    ADD CONSTRAINT "candidatos_content_hash_key" UNIQUE ("content_hash");



ALTER TABLE ONLY "public"."candidatos_duplicate"
    ADD CONSTRAINT "candidatos_duplicate_content_hash_key" UNIQUE ("content_hash");



ALTER TABLE ONLY "public"."candidatos_duplicate"
    ADD CONSTRAINT "candidatos_duplicate_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."candidatos"
    ADD CONSTRAINT "candidatos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."carpetas"
    ADD CONSTRAINT "carpetas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."evaluaciones_duplicate"
    ADD CONSTRAINT "evaluaciones_duplicate_candidato_id_aviso_id_key" UNIQUE ("candidato_id", "aviso_id");



ALTER TABLE ONLY "public"."evaluaciones_duplicate"
    ADD CONSTRAINT "evaluaciones_duplicate_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."evaluaciones"
    ADD CONSTRAINT "evaluaciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."perfiles"
    ADD CONSTRAINT "perfiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."postulaciones"
    ADD CONSTRAINT "postulaciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."procesamiento_cvs"
    ADD CONSTRAINT "procesamiento_cvs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."postulaciones"
    ADD CONSTRAINT "unique_aviso_perfil" UNIQUE ("aviso_id", "perfil_id");



ALTER TABLE ONLY "public"."app_saas_postulaciones"
    ADD CONSTRAINT "unique_candidate_per_aviso" UNIQUE ("aviso_id", "candidato_id");



ALTER TABLE ONLY "public"."evaluaciones"
    ADD CONSTRAINT "unique_candidato_aviso" UNIQUE ("candidato_id", "aviso_id");



ALTER TABLE ONLY "public"."app_saas_candidatos"
    ADD CONSTRAINT "unique_email_per_user" UNIQUE ("user_id", "email");



ALTER TABLE ONLY "public"."app_saas_candidatos"
    ADD CONSTRAINT "unique_user_file_constraint" UNIQUE ("user_id", "nombre_archivo_general");



ALTER TABLE ONLY "public"."v2_postulaciones"
    ADD CONSTRAINT "unique_v2_candidato_aviso" UNIQUE ("candidato_id", "aviso_id");



ALTER TABLE ONLY "public"."v2_avisos"
    ADD CONSTRAINT "v2_avisos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."v2_candidatos"
    ADD CONSTRAINT "v2_candidatos_nombre_candidato_key" UNIQUE ("nombre_candidato");



ALTER TABLE ONLY "public"."v2_candidatos"
    ADD CONSTRAINT "v2_candidatos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."v2_carpetas"
    ADD CONSTRAINT "v2_carpetas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."v2_notas_historial"
    ADD CONSTRAINT "v2_notas_historial_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."v2_postulaciones"
    ADD CONSTRAINT "v2_postulaciones_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_postulaciones_aviso_id" ON "public"."postulaciones" USING "btree" ("aviso_id");



CREATE INDEX "idx_postulaciones_perfil_id" ON "public"."postulaciones" USING "btree" ("perfil_id");



CREATE OR REPLACE TRIGGER "on_new_postulacion_increment_count" AFTER INSERT ON "public"."app_saas_postulaciones" FOR EACH ROW EXECUTE FUNCTION "public"."increment_postulaciones_count"();



CREATE OR REPLACE TRIGGER "on_postulacion_delete" AFTER DELETE ON "public"."v2_postulaciones" FOR EACH ROW EXECUTE FUNCTION "public"."update_postulaciones_count"();



CREATE OR REPLACE TRIGGER "on_postulacion_insert" AFTER INSERT ON "public"."v2_postulaciones" FOR EACH ROW EXECUTE FUNCTION "public"."update_postulaciones_count"();



CREATE OR REPLACE TRIGGER "trigger_analisis_on_new_postulacion" AFTER INSERT ON "public"."app_saas_postulaciones" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_postulacion"();



CREATE OR REPLACE TRIGGER "trigger_on_postulacion_change" AFTER INSERT OR UPDATE ON "public"."postulaciones" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_process_cv_on_change"();



ALTER TABLE ONLY "public"."COPIA CANDIDATOS"
    ADD CONSTRAINT "COPIA CANDIDATOS_carpeta_id_fkey" FOREIGN KEY ("carpeta_id") REFERENCES "public"."carpetas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."COPIA EVALUACIONES"
    ADD CONSTRAINT "COPIA EVALUACIONES_aviso_id_fkey" FOREIGN KEY ("aviso_id") REFERENCES "public"."avisos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."COPIA EVALUACIONES"
    ADD CONSTRAINT "COPIA EVALUACIONES_candidato_id_fkey" FOREIGN KEY ("candidato_id") REFERENCES "public"."candidatos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."app_saas_avisos"
    ADD CONSTRAINT "app_saas_avisos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_saas_candidatos"
    ADD CONSTRAINT "app_saas_candidatos_carpeta_id_fkey" FOREIGN KEY ("carpeta_id") REFERENCES "public"."app_saas_carpetas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."app_saas_candidatos"
    ADD CONSTRAINT "app_saas_candidatos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_saas_carpetas"
    ADD CONSTRAINT "app_saas_carpetas_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."app_saas_carpetas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."app_saas_carpetas"
    ADD CONSTRAINT "app_saas_carpetas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_saas_import_queue"
    ADD CONSTRAINT "app_saas_import_queue_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."app_saas_carpetas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."app_saas_import_queue"
    ADD CONSTRAINT "app_saas_import_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_saas_invoices"
    ADD CONSTRAINT "app_saas_invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_saas_notas"
    ADD CONSTRAINT "app_saas_notas_candidato_id_fkey" FOREIGN KEY ("candidato_id") REFERENCES "public"."app_saas_candidatos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_saas_notas"
    ADD CONSTRAINT "app_saas_notas_postulacion_id_fkey" FOREIGN KEY ("postulacion_id") REFERENCES "public"."app_saas_postulaciones"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."app_saas_notas"
    ADD CONSTRAINT "app_saas_notas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_saas_postulaciones"
    ADD CONSTRAINT "app_saas_postulaciones_aviso_id_fkey" FOREIGN KEY ("aviso_id") REFERENCES "public"."app_saas_avisos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_saas_postulaciones"
    ADD CONSTRAINT "app_saas_postulaciones_candidato_id_fkey" FOREIGN KEY ("candidato_id") REFERENCES "public"."app_saas_candidatos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_saas_users"
    ADD CONSTRAINT "app_saas_users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."candidatos"
    ADD CONSTRAINT "candidatos_carpeta_id_fkey" FOREIGN KEY ("carpeta_id") REFERENCES "public"."carpetas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."candidatos_duplicate"
    ADD CONSTRAINT "candidatos_duplicate_carpeta_id_fkey" FOREIGN KEY ("carpeta_id") REFERENCES "public"."carpetas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."carpetas"
    ADD CONSTRAINT "carpetas_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."carpetas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."evaluaciones"
    ADD CONSTRAINT "evaluaciones_aviso_id_fkey" FOREIGN KEY ("aviso_id") REFERENCES "public"."avisos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."evaluaciones"
    ADD CONSTRAINT "evaluaciones_candidato_id_fkey" FOREIGN KEY ("candidato_id") REFERENCES "public"."candidatos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."evaluaciones_duplicate"
    ADD CONSTRAINT "evaluaciones_duplicate_aviso_id_fkey" FOREIGN KEY ("aviso_id") REFERENCES "public"."avisos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."evaluaciones_duplicate"
    ADD CONSTRAINT "evaluaciones_duplicate_candidato_id_fkey" FOREIGN KEY ("candidato_id") REFERENCES "public"."candidatos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."perfiles"
    ADD CONSTRAINT "perfiles_carpeta_id_fkey" FOREIGN KEY ("carpeta_id") REFERENCES "public"."carpetas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."postulaciones"
    ADD CONSTRAINT "postulaciones_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."v2_candidatos"
    ADD CONSTRAINT "v2_candidatos_carpeta_id_fkey" FOREIGN KEY ("carpeta_id") REFERENCES "public"."v2_carpetas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."v2_carpetas"
    ADD CONSTRAINT "v2_carpetas_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."v2_carpetas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."v2_notas_historial"
    ADD CONSTRAINT "v2_notas_historial_candidato_id_fkey" FOREIGN KEY ("candidato_id") REFERENCES "public"."v2_candidatos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."v2_postulaciones"
    ADD CONSTRAINT "v2_postulaciones_aviso_id_fkey" FOREIGN KEY ("aviso_id") REFERENCES "public"."v2_avisos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."v2_postulaciones"
    ADD CONSTRAINT "v2_postulaciones_candidato_id_fkey_setnull" FOREIGN KEY ("candidato_id") REFERENCES "public"."v2_candidatos"("id") ON DELETE SET NULL;



CREATE POLICY "Enable read access for all users" ON "public"."perfiles" FOR SELECT USING (true);



CREATE POLICY "Los usuarios pueden actualizar su propio perfil." ON "public"."app_saas_users" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Los usuarios pueden crear perfiles." ON "public"."perfiles" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Los usuarios pueden crear sus propios avisos" ON "public"."app_saas_avisos" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Los usuarios pueden gestionar postulaciones de sus avisos" ON "public"."app_saas_postulaciones" USING (( SELECT ("auth"."uid"() = "app_saas_avisos"."user_id")
   FROM "public"."app_saas_avisos"
  WHERE ("app_saas_avisos"."id" = "app_saas_postulaciones"."aviso_id")));



CREATE POLICY "Los usuarios pueden gestionar su propio perfil" ON "public"."app_saas_users" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Los usuarios pueden gestionar sus propias carpetas" ON "public"."app_saas_carpetas" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Los usuarios pueden gestionar sus propias notas" ON "public"."app_saas_notas" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Los usuarios pueden gestionar sus propios avisos" ON "public"."app_saas_avisos" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Los usuarios pueden gestionar sus propios candidatos" ON "public"."app_saas_candidatos" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Los usuarios pueden ver su propio perfil." ON "public"."app_saas_users" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Los usuarios pueden ver sus propias facturas" ON "public"."app_saas_invoices" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Los usuarios pueden ver sus propios avisos" ON "public"."app_saas_avisos" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Los usuarios pueden ver todos los perfiles." ON "public"."perfiles" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Permitir acceso total a avisos" ON "public"."avisos" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Permitir acceso total a candidatos" ON "public"."candidatos" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Permitir acceso total a carpetas" ON "public"."carpetas" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Permitir acceso total a evaluaciones" ON "public"."evaluaciones" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Permitir acceso total a procesamiento_cvs" ON "public"."procesamiento_cvs" TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Permitir inserción pública de perfiles y postulaciones." ON "public"."perfiles" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Permitir inserción pública de postulaciones." ON "public"."postulaciones" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "V2: Cualquiera puede crear una postulación (público)." ON "public"."v2_postulaciones" FOR INSERT WITH CHECK (true);



CREATE POLICY "V2: Cualquiera puede insertar un nuevo candidato (público)." ON "public"."v2_candidatos" FOR INSERT WITH CHECK (true);



CREATE POLICY "V2: Los dueños pueden actualizar sus avisos." ON "public"."v2_avisos" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "V2: Los dueños pueden eliminar sus avisos." ON "public"."v2_avisos" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "V2: Los dueños pueden ver y gestionar sus candidatos." ON "public"."v2_candidatos" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "V2: Los usuarios autenticados pueden crear avisos." ON "public"."v2_avisos" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "V2: Los usuarios pueden actualizar las postulaciones de sus avi" ON "public"."v2_postulaciones" FOR UPDATE USING ((("auth"."role"() = 'authenticated'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."v2_avisos"
  WHERE (("v2_avisos"."id" = "v2_postulaciones"."aviso_id") AND ("v2_avisos"."user_id" = "auth"."uid"()))))));



CREATE POLICY "V2: Los usuarios pueden gestionar sus propias carpetas." ON "public"."v2_carpetas" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "V2: Los usuarios pueden ver las postulaciones de sus propios av" ON "public"."v2_postulaciones" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."v2_avisos"
  WHERE (("v2_avisos"."id" = "v2_postulaciones"."aviso_id") AND ("v2_avisos"."user_id" = "auth"."uid"()))))));



CREATE POLICY "V2: Los usuarios pueden ver todos los avisos (público)." ON "public"."v2_avisos" FOR SELECT USING (true);



ALTER TABLE "public"."app_saas_invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_saas_users" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."app_saas_import_queue";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."app_saas_postulaciones";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."find_duplicate_emails"() TO "anon";
GRANT ALL ON FUNCTION "public"."find_duplicate_emails"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_duplicate_emails"() TO "service_role";



GRANT ALL ON FUNCTION "public"."find_duplicate_hashes"() TO "anon";
GRANT ALL ON FUNCTION "public"."find_duplicate_hashes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_duplicate_hashes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_candidate_counts_by_folder"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_candidate_counts_by_folder"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_candidate_counts_by_folder"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_candidatos_with_folder_path"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_candidatos_with_folder_path"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_candidatos_with_folder_path"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_organization_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_organization_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_organization_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_cv"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_cv"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_cv"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_postulacion"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_postulacion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_postulacion"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_submission"("p_email" "text", "p_nombre" "text", "p_telefono" "text", "p_aviso_id" bigint, "p_base64_cv" "text", "p_texto_cv" "text", "p_nombre_archivo" "text", "p_carpeta_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."handle_submission"("p_email" "text", "p_nombre" "text", "p_telefono" "text", "p_aviso_id" bigint, "p_base64_cv" "text", "p_texto_cv" "text", "p_nombre_archivo" "text", "p_carpeta_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_submission"("p_email" "text", "p_nombre" "text", "p_telefono" "text", "p_aviso_id" bigint, "p_base64_cv" "text", "p_texto_cv" "text", "p_nombre_archivo" "text", "p_carpeta_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."importar_candidatos_a_aviso"("target_aviso_id" integer, "source_candidato_ids" integer[]) TO "anon";
GRANT ALL ON FUNCTION "public"."importar_candidatos_a_aviso"("target_aviso_id" integer, "source_candidato_ids" integer[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."importar_candidatos_a_aviso"("target_aviso_id" integer, "source_candidato_ids" integer[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_applications_count"("posting_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_applications_count"("posting_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_applications_count"("posting_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_applications_count"("posting_id" bigint, "increment_by" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_applications_count"("posting_id" bigint, "increment_by" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_applications_count"("posting_id" bigint, "increment_by" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_cv_read_count"("user_id_param" "uuid", "increment_value" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_cv_read_count"("user_id_param" "uuid", "increment_value" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_cv_read_count"("user_id_param" "uuid", "increment_value" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_postulaciones_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."increment_postulaciones_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_postulaciones_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_process_cv_on_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_process_cv_on_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_process_cv_on_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_postulaciones_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_postulaciones_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_postulaciones_count"() TO "service_role";


















GRANT ALL ON TABLE "public"."COPIA AVISOS" TO "anon";
GRANT ALL ON TABLE "public"."COPIA AVISOS" TO "authenticated";
GRANT ALL ON TABLE "public"."COPIA AVISOS" TO "service_role";



GRANT ALL ON SEQUENCE "public"."COPIA AVISOS_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."COPIA AVISOS_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."COPIA AVISOS_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."COPIA CANDIDATOS" TO "anon";
GRANT ALL ON TABLE "public"."COPIA CANDIDATOS" TO "authenticated";
GRANT ALL ON TABLE "public"."COPIA CANDIDATOS" TO "service_role";



GRANT ALL ON SEQUENCE "public"."COPIA CANDIDATOS_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."COPIA CANDIDATOS_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."COPIA CANDIDATOS_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."COPIA EVALUACIONES" TO "anon";
GRANT ALL ON TABLE "public"."COPIA EVALUACIONES" TO "authenticated";
GRANT ALL ON TABLE "public"."COPIA EVALUACIONES" TO "service_role";



GRANT ALL ON SEQUENCE "public"."COPIA EVALUACIONES_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."COPIA EVALUACIONES_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."COPIA EVALUACIONES_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."app_saas_avisos" TO "anon";
GRANT ALL ON TABLE "public"."app_saas_avisos" TO "authenticated";
GRANT ALL ON TABLE "public"."app_saas_avisos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_saas_avisos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_saas_avisos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_saas_avisos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."app_saas_candidatos" TO "anon";
GRANT ALL ON TABLE "public"."app_saas_candidatos" TO "authenticated";
GRANT ALL ON TABLE "public"."app_saas_candidatos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_saas_candidatos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_saas_candidatos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_saas_candidatos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."app_saas_carpetas" TO "anon";
GRANT ALL ON TABLE "public"."app_saas_carpetas" TO "authenticated";
GRANT ALL ON TABLE "public"."app_saas_carpetas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_saas_carpetas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_saas_carpetas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_saas_carpetas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."app_saas_import_queue" TO "anon";
GRANT ALL ON TABLE "public"."app_saas_import_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."app_saas_import_queue" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_saas_import_queue_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_saas_import_queue_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_saas_import_queue_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."app_saas_invoices" TO "anon";
GRANT ALL ON TABLE "public"."app_saas_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."app_saas_invoices" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_saas_invoices_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_saas_invoices_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_saas_invoices_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."app_saas_notas" TO "anon";
GRANT ALL ON TABLE "public"."app_saas_notas" TO "authenticated";
GRANT ALL ON TABLE "public"."app_saas_notas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_saas_notas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_saas_notas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_saas_notas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."app_saas_postulaciones" TO "anon";
GRANT ALL ON TABLE "public"."app_saas_postulaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."app_saas_postulaciones" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_saas_postulaciones_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_saas_postulaciones_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_saas_postulaciones_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."app_saas_users" TO "anon";
GRANT ALL ON TABLE "public"."app_saas_users" TO "authenticated";
GRANT ALL ON TABLE "public"."app_saas_users" TO "service_role";



GRANT ALL ON TABLE "public"."avisos" TO "anon";
GRANT ALL ON TABLE "public"."avisos" TO "authenticated";
GRANT ALL ON TABLE "public"."avisos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."avisos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."avisos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."avisos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."candidatos" TO "anon";
GRANT ALL ON TABLE "public"."candidatos" TO "authenticated";
GRANT ALL ON TABLE "public"."candidatos" TO "service_role";



GRANT ALL ON TABLE "public"."candidatos_duplicate" TO "anon";
GRANT ALL ON TABLE "public"."candidatos_duplicate" TO "authenticated";
GRANT ALL ON TABLE "public"."candidatos_duplicate" TO "service_role";



GRANT ALL ON SEQUENCE "public"."candidatos_duplicate_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."candidatos_duplicate_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."candidatos_duplicate_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."candidatos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."candidatos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."candidatos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."carpetas" TO "anon";
GRANT ALL ON TABLE "public"."carpetas" TO "authenticated";
GRANT ALL ON TABLE "public"."carpetas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."carpetas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."carpetas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."carpetas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."evaluaciones" TO "anon";
GRANT ALL ON TABLE "public"."evaluaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."evaluaciones" TO "service_role";



GRANT ALL ON TABLE "public"."evaluaciones_duplicate" TO "anon";
GRANT ALL ON TABLE "public"."evaluaciones_duplicate" TO "authenticated";
GRANT ALL ON TABLE "public"."evaluaciones_duplicate" TO "service_role";



GRANT ALL ON SEQUENCE "public"."evaluaciones_duplicate_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."evaluaciones_duplicate_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."evaluaciones_duplicate_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."evaluaciones_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."evaluaciones_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."evaluaciones_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."perfiles" TO "anon";
GRANT ALL ON TABLE "public"."perfiles" TO "authenticated";
GRANT ALL ON TABLE "public"."perfiles" TO "service_role";



GRANT ALL ON SEQUENCE "public"."perfiles_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."perfiles_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."perfiles_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."postulaciones" TO "anon";
GRANT ALL ON TABLE "public"."postulaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."postulaciones" TO "service_role";



GRANT ALL ON SEQUENCE "public"."postulaciones_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."postulaciones_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."postulaciones_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."procesamiento_cvs" TO "anon";
GRANT ALL ON TABLE "public"."procesamiento_cvs" TO "authenticated";
GRANT ALL ON TABLE "public"."procesamiento_cvs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."procesamiento_cvs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."procesamiento_cvs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."procesamiento_cvs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."v2_avisos" TO "anon";
GRANT ALL ON TABLE "public"."v2_avisos" TO "authenticated";
GRANT ALL ON TABLE "public"."v2_avisos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."v2_avisos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."v2_avisos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."v2_avisos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."v2_candidatos" TO "anon";
GRANT ALL ON TABLE "public"."v2_candidatos" TO "authenticated";
GRANT ALL ON TABLE "public"."v2_candidatos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."v2_candidatos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."v2_candidatos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."v2_candidatos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."v2_carpetas" TO "anon";
GRANT ALL ON TABLE "public"."v2_carpetas" TO "authenticated";
GRANT ALL ON TABLE "public"."v2_carpetas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."v2_carpetas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."v2_carpetas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."v2_carpetas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."v2_notas_historial" TO "anon";
GRANT ALL ON TABLE "public"."v2_notas_historial" TO "authenticated";
GRANT ALL ON TABLE "public"."v2_notas_historial" TO "service_role";



GRANT ALL ON SEQUENCE "public"."v2_notas_historial_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."v2_notas_historial_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."v2_notas_historial_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."v2_postulaciones" TO "anon";
GRANT ALL ON TABLE "public"."v2_postulaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."v2_postulaciones" TO "service_role";



GRANT ALL ON SEQUENCE "public"."v2_postulaciones_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."v2_postulaciones_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."v2_postulaciones_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






























RESET ALL;
