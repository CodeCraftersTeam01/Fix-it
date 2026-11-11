<?php

namespace App\Http\Controllers;

class StudentController
{
    public function index()
    {
        // Intentional missing parenthesis to simulate student syntax error
        $data = Student::where('nim', $nim->first();
        return view('student.index', compact('data'));
    }
}

