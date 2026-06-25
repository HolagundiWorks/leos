<?php
function par_rep($match = '', $exp = '', $sub = '')  
{
    if ($sub === null || $sub === '') {
        return $sub;
    }
    return preg_replace($match, $exp, $sub);
}

function par_rep_all($match = '', $sub = '', &$exp = null)
{
    if ($exp === null) {
        $exp = [];
    }
    return preg_match_all($match, $sub, $exp);
}

function par_rep_mt($match = '', $sub = '', &$exp = null)
{
    if ($exp === null) {
        $exp = [];
    }
    return preg_match($match, $sub, $exp);
}

function par_spt($pattern = '', $sub = '')
{
    return preg_split($pattern, $sub);
}

function par_rep_cb($match = '', $exp = '', $sub = '')  
{
    if ($sub === null || $sub === '') {
        return $sub;
    }
    if (strlen($match) >= 2 && $match[0] === '/' && $match[strlen($match) - 1] === '/') {
        $match = '~' . trim($match, '/') . '~';
    }
    return preg_replace_callback($match, 'exp_match', $sub);
}

function exp_match($matches)
{
    return $matches[0];
}
?>