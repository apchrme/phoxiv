-- Update the file_type in the year_files table
UPDATE year_files
SET file_type = COALESCE(
    (
        SELECT json_extract(o.year_file_types, '$.' || year_files.file_type || '.label')
        FROM years y
        JOIN olympiads o ON y.olympiad_id = o.id
        WHERE y.id = year_files.year_id
    ), 
    file_type -- Fallback to the original file_type if the label isn't found
);

-- Update the file_type in the problem_files table
UPDATE problem_files
SET file_type = COALESCE(
    (
        SELECT json_extract(o.problem_file_types, '$.' || problem_files.file_type || '.label')
        FROM problems p
        JOIN years y ON p.year_id = y.id
        JOIN olympiads o ON y.olympiad_id = o.id
        WHERE p.id = problem_files.problem_id
    ), 
    file_type -- Fallback to the original file_type if the label isn't found
);