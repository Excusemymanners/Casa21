-- Fix RLS pentru tabela tasks - permite angajaților să vadă TOATE taskurile
-- dar să poată completa doar pe cele asignate lor sau neasignate

-- 1. Verifică politicile existente pentru tasks
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'tasks';

-- 2. Șterge politicile vechi restrictive
DROP POLICY IF EXISTS "Users can view all tasks" ON tasks;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON tasks;
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON tasks;

-- 3. Creează politică care permite tuturor utilizatorilor autentificați să CITEASCĂ toate taskurile
CREATE POLICY "Enable read access for all authenticated users" 
ON tasks 
FOR SELECT 
TO authenticated 
USING (true);

-- 4. Politica pentru INSERT (doar CEO/Admin pot crea taskuri direct)
DROP POLICY IF EXISTS "Enable insert for authenticated users based on user_id" ON tasks;
DROP POLICY IF EXISTS "CEO and Admin can insert tasks" ON tasks;
CREATE POLICY "CEO and Admin can insert tasks" 
ON tasks 
FOR INSERT 
TO authenticated 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role IN ('ceo', 'admin')
    )
);

-- 5. Politica pentru UPDATE 
-- CEO/Admin pot actualiza orice
-- Employee-ii pot actualiza doar taskurile asignate lor SAU neasignate
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON tasks;
DROP POLICY IF EXISTS "Users can update their tasks" ON tasks;
DROP POLICY IF EXISTS "CEO and Admin can update all tasks" ON tasks;
DROP POLICY IF EXISTS "Employees can update assigned or unassigned tasks" ON tasks;

CREATE POLICY "CEO and Admin can update all tasks" 
ON tasks 
FOR UPDATE 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role IN ('ceo', 'admin')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role IN ('ceo', 'admin')
    )
);

CREATE POLICY "Employees can update assigned or unassigned tasks" 
ON tasks 
FOR UPDATE 
TO authenticated 
USING (
    -- Employee poate actualiza dacă taskul e asignat lui (prin uuid array) SAU e asignat pe email-ul lui SAU e neasignat
    (auth.uid() = ANY(coalesce(assigned_to, ARRAY[]::uuid[])))
    OR assigned_to_email = (SELECT email FROM profiles WHERE id = auth.uid())
    OR assigned_to_email IS NULL
)
WITH CHECK (
    -- Același check pentru update (permite și când userul e în assigned_to)
    (auth.uid() = ANY(coalesce(assigned_to, ARRAY[]::uuid[])))
    OR assigned_to_email = (SELECT email FROM profiles WHERE id = auth.uid())
    OR assigned_to_email IS NULL
);

-- 6. Politica pentru DELETE (doar CEO/Admin pot șterge taskuri)
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON tasks;
DROP POLICY IF EXISTS "CEO and Admin can delete tasks" ON tasks;
CREATE POLICY "CEO and Admin can delete tasks" 
ON tasks 
FOR DELETE 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role IN ('ceo', 'admin')
    )
);

-- 7. Verifică politicile noi
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'tasks'
ORDER BY cmd, policyname;

-- 8. Testează accesul (rulează ca angajat)
-- Ar trebui să vezi TOATE taskurile, nu doar cele asignate ție
SELECT id, name, job_id, assigned_to_email, status, created_at 
FROM tasks 
ORDER BY created_at DESC
LIMIT 10;
